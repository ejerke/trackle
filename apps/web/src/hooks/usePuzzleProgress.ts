import { edgesFromMasks, fixedEdges, puzzleFingerprint, type HintKind, type PuzzleLayout } from "@trackle/shared";
import { clearedBoard } from "../board/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { reconcileProgress } from "../storage/reconcile";
import { streakChanged } from "./useStreak";
import {
  puzzleKeyId,
  type BoardState,
  type ProgressStore,
  type PuzzleKey,
  type PuzzleProgress,
} from "../storage/progressStore";

const SAVE_DELAY_MS = 300;

export interface PuzzleProgressApi {
  /** null while loading from the store. */
  progress: PuzzleProgress | null;
  /** Apply an edit. Ignored once solved. `fn` may return the same board for "no change". */
  updateBoard(fn: (board: BoardState) => BoardState): void;
  /**
   * When the clock started running (performance.now()), or null while it is
   * stopped. Elapsed time = progress.timeMs + (now - runningSince).
   */
  runningSince: number | null;
  /** Record a server check result; a correct one stops the clock. Saved immediately. */
  recordCheck(correct: boolean, cells: number[][]): void;
  clearBoard(): void;
  /** Count one hint of this kind (after the server gave it) and put it on the board. Saved immediately. */
  recordHint(kind: HintKind, apply: (board: BoardState) => BoardState): void;
  /** Show the answer: the board becomes the solution and the puzzle is locked as revealed. */
  revealAnswer(solution: number[][]): void;
  /** Whether the store can save to an account right now (signed in). */
  canSaveToAccount: boolean;
  /** Save the current board to the account; marks it saved unless edited meanwhile. */
  saveToAccount(): Promise<void>;
}

const finished = (p: PuzzleProgress) => p.solvedAt !== null || p.revealedAt !== null;

/**
 * Loads and saves one puzzle's progress through a ProgressStore. Board edits
 * are debounced; check results and page hide are saved right away.
 *
 * Also runs the solving clock (ADR 0017): it starts at the first move (or on
 * load, if this puzzle was already started), pauses while the page is hidden
 * and stops at the solve. Time is folded into progress.timeMs at every save.
 */
export function usePuzzleProgress(store: ProgressStore, key: PuzzleKey, layout: PuzzleLayout): PuzzleProgressApi {
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  // The latest value, so several edits in one event chain correctly.
  const latest = useRef<PuzzleProgress | null>(null);
  const pending = useRef<PuzzleProgress | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Effects depend on the key's id (a string), so a new-but-equal key object doesn't reload.
  const id = puzzleKeyId(key);
  const keyRef = useRef(key);
  keyRef.current = key;
  const fingerprint = puzzleFingerprint(layout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // The clock: a ref for exact bookkeeping, state so the display re-renders.
  const since = useRef<number | null>(null);
  const [runningSince, setRunningSince] = useState<number | null>(null);

  const setClock = useCallback((value: number | null) => {
    since.current = value;
    setRunningSince(value);
  }, []);

  /** `p` with the time run since the clock last started folded in; restarts the segment. */
  const withTime = useCallback((p: PuzzleProgress): PuzzleProgress => {
    if (since.current === null) return p;
    const now = performance.now();
    const timeMs = p.timeMs + Math.round(now - since.current);
    setClock(now);
    return { ...p, timeMs };
  }, [setClock]);

  /** Start the clock if the puzzle is in play and the page is visible. */
  const startClock = useCallback(() => {
    const current = latest.current;
    if (since.current !== null || !current || finished(current) || document.visibilityState === "hidden") return;
    setClock(performance.now());
  }, [setClock]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    // Bank the running time, so a closed tab doesn't lose it.
    if (since.current !== null && latest.current) {
      latest.current = withTime(latest.current);
      pending.current = latest.current;
      setProgress(latest.current);
    }
    if (pending.current) {
      const saving = pending.current;
      // Streaks count stored solves, so they recount once a solve is stored.
      void store.save(saving).then(() => saving.solvedAt && saving.key.kind === "daily" && streakChanged());
      pending.current = null;
    }
  }, [store, withTime]);

  const commit = useCallback(
    (next: PuzzleProgress, immediate: boolean) => {
      latest.current = next;
      pending.current = next;
      setProgress(next);
      window.clearTimeout(timer.current);
      if (immediate) flush();
      else timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    let cancelled = false;
    latest.current = null;
    setProgress(null);
    setClock(null);
    const current = keyRef.current;
    void store.get(current).then((stored) => {
      if (cancelled) return;
      // Never show a board saved for a different puzzle under the same key.
      const { progress: loaded, action } = reconcileProgress(stored, current, layoutRef.current);
      if (action === "discard") {
        console.info("Discarded saved progress drawn on a different version of this puzzle");
        void store.delete(current);
      } else if (action === "adopt") {
        void store.save(loaded); // remember which puzzle it belongs to from now on
      }
      latest.current = loaded;
      setProgress(loaded);
      // Coming back to a puzzle already under way: the clock carries on.
      if (loaded.timeMs > 0) startClock();
    });
    return () => {
      cancelled = true;
    };
  }, [store, id, fingerprint, setClock, startClock]);

  useEffect(() => {
    // pagehide: tab closed or navigated away; visibilitychange: phones often
    // background a page without ever firing pagehide.
    // Hidden pauses the clock; visible again resumes it if the puzzle had started.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flush();
        setClock(null);
      } else if ((latest.current?.timeMs ?? 0) > 0) {
        startClock();
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [flush, setClock, startClock]);

  const updateBoard = useCallback(
    (fn: (board: BoardState) => BoardState) => {
      const current = latest.current;
      if (!current || current.solvedAt || current.revealedAt) return;
      const board = fn(current.board);
      if (board === current.board) return;
      startClock(); // the first move starts the clock
      commit(withTime({ ...current, board, boardDirty: true, updatedAt: new Date().toISOString() }), false);
    },
    [commit, startClock, withTime],
  );

  const recordCheck = useCallback(
    (correct: boolean, cells: number[][]) => {
      const current = latest.current;
      if (!current || current.solvedAt || current.revealedAt) return;
      const now = new Date().toISOString();
      const next = withTime({
        ...current,
        checks: current.checks + 1,
        updatedAt: now,
        solvedAt: correct ? now : null,
        solvedCells: correct ? cells : null,
      });
      if (correct) setClock(null);
      commit(next, true);
    },
    [commit, setClock, withTime],
  );

  const recordHint = useCallback(
    (kind: HintKind, apply: (board: BoardState) => BoardState) => {
      const current = latest.current;
      if (!current || current.solvedAt || current.revealedAt) return;
      startClock(); // asking for a hint counts as starting
      const board = apply(current.board);
      const count = kind === "track" ? { hintsUsed: current.hintsUsed + 1 } : { emptyHintsUsed: current.emptyHintsUsed + 1 };
      const changed = board === current.board ? {} : { board, boardDirty: true };
      commit(withTime({ ...current, ...count, ...changed, updatedAt: new Date().toISOString() }), true);
    },
    [commit, startClock, withTime],
  );

  const revealAnswer = useCallback(
    (solution: number[][]) => {
      const current = latest.current;
      if (!current || current.solvedAt || current.revealedAt) return;
      const layout = layoutRef.current;
      const fixed = fixedEdges(layout);
      const edges = edgesFromMasks(layout.width, layout.height, solution).filter((e) => !fixed.has(e));
      const now = new Date().toISOString();
      const next = withTime({ ...current, board: { edges, marks: {} }, revealedAt: now, updatedAt: now, boardDirty: false });
      setClock(null);
      commit(next, true);
    },
    [commit, setClock, withTime],
  );

  const clearBoard = useCallback(() => updateBoard(clearedBoard), [updateBoard]);

  const saveToAccount = useCallback(async () => {
    const current = latest.current;
    if (!current || !store.saveToAccount) return;
    flush();
    const stored = await store.saveToAccount(current);
    const now = latest.current!;
    // Edits made while the request was in flight stay unsaved.
    const unchanged = JSON.stringify(now.board) === JSON.stringify(current.board);
    commit({ ...now, boardSavedAt: stored.boardSavedAt, boardDirty: unchanged ? false : now.boardDirty }, true);
  }, [store, flush, commit]);

  return {
    progress,
    runningSince,
    updateBoard,
    recordCheck,
    recordHint,
    revealAnswer,
    clearBoard,
    canSaveToAccount: Boolean(store.signedIn && store.saveToAccount),
    saveToAccount,
  };
}
