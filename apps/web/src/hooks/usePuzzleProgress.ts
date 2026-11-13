import { edgesFromMasks, fixedEdges, isBookmarked, puzzleFingerprint, type HintKind, type PuzzleLayout } from "@trackle/shared";
import { clearedBoard } from "../board/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { reconcileProgress } from "../storage/reconcile";
import { canReplay, currentAttempt, startReplay, withAttempt } from "../storage/replay";
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
  /**
   * The attempt on screen: the first one, or a replay ("Try again"). null
   * while loading from the store. Everything below acts on this attempt.
   */
  progress: PuzzleProgress | null;
  /** The whole record: the first attempt (what stats count), the bookmark, the replay. */
  record: PuzzleProgress | null;
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
  /** "Try again" on a finished puzzle: a new replay with an empty board and fresh hints. */
  playAgain(): void;
  /** Leave the replay and show the first attempt's result again. */
  stopReplay(): void;
  /** Add or remove the bookmark. */
  toggleBookmark(): void;
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
  // The whole record. Edits act on currentAttempt(record) and go back via withAttempt().
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
    if (since.current !== null || !current || finished(currentAttempt(current)) || document.visibilityState === "hidden") return;
    setClock(performance.now());
  }, [setClock]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    // Bank the running time, so a closed tab doesn't lose it.
    if (since.current !== null && latest.current) {
      latest.current = withAttempt(latest.current, withTime(currentAttempt(latest.current)));
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
      if (currentAttempt(loaded).timeMs > 0) startClock();
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
      } else if (latest.current && currentAttempt(latest.current).timeMs > 0) {
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

  /** The attempt on screen, if it is still being played. */
  const playing = (): PuzzleProgress | null => {
    const current = latest.current && currentAttempt(latest.current);
    return current && !finished(current) ? current : null;
  };
  /** Store the edited attempt on screen. */
  const commitAttempt = useCallback(
    (attempt: PuzzleProgress, immediate: boolean) => commit(withAttempt(latest.current!, attempt), immediate),
    [commit],
  );

  const updateBoard = useCallback(
    (fn: (board: BoardState) => BoardState) => {
      const current = playing();
      if (!current) return;
      const board = fn(current.board);
      if (board === current.board) return;
      startClock(); // the first move starts the clock
      commitAttempt(withTime({ ...current, board, boardDirty: true, updatedAt: new Date().toISOString() }), false);
    },
    [commitAttempt, startClock, withTime],
  );

  const recordCheck = useCallback(
    (correct: boolean, cells: number[][]) => {
      const current = playing();
      if (!current) return;
      const now = new Date().toISOString();
      const next = withTime({
        ...current,
        checks: current.checks + 1,
        updatedAt: now,
        solvedAt: correct ? now : null,
        solvedCells: correct ? cells : null,
      });
      if (correct) setClock(null);
      commitAttempt(next, true);
    },
    [commitAttempt, setClock, withTime],
  );

  const recordHint = useCallback(
    (kind: HintKind, apply: (board: BoardState) => BoardState) => {
      const current = playing();
      if (!current) return;
      startClock(); // asking for a hint counts as starting
      const board = apply(current.board);
      const count = kind === "track" ? { hintsUsed: current.hintsUsed + 1 } : { emptyHintsUsed: current.emptyHintsUsed + 1 };
      const changed = board === current.board ? {} : { board, boardDirty: true };
      commitAttempt(withTime({ ...current, ...count, ...changed, updatedAt: new Date().toISOString() }), true);
    },
    [commitAttempt, startClock, withTime],
  );

  const revealAnswer = useCallback(
    (solution: number[][]) => {
      const current = playing();
      if (!current) return;
      const layout = layoutRef.current;
      const fixed = fixedEdges(layout);
      const edges = edgesFromMasks(layout.width, layout.height, solution).filter((e) => !fixed.has(e));
      const now = new Date().toISOString();
      const next = withTime({ ...current, board: { edges, marks: {} }, revealedAt: now, updatedAt: now, boardDirty: false });
      setClock(null);
      commitAttempt(next, true);
    },
    [commitAttempt, setClock, withTime],
  );

  const playAgain = useCallback(() => {
    const current = latest.current;
    if (!current || !canReplay(current)) return;
    setClock(null); // runs again from the first move
    commit(startReplay(current), true);
  }, [commit, setClock]);

  const stopReplay = useCallback(() => {
    const current = latest.current;
    if (!current?.replay) return;
    setClock(null);
    commit({ ...current, replay: null }, true);
  }, [commit, setClock]);

  const toggleBookmark = useCallback(() => {
    const current = latest.current;
    if (!current) return;
    // A name survives switching the bookmark off and on again.
    commit({ ...current, bookmark: { ...current.bookmark, on: !isBookmarked(current), at: new Date().toISOString() } }, true);
  }, [commit]);

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
    progress: progress && currentAttempt(progress),
    record: progress,
    runningSince,
    updateBoard,
    recordCheck,
    recordHint,
    revealAnswer,
    clearBoard,
    // A replay never goes to the account.
    canSaveToAccount: Boolean(store.signedIn && store.saveToAccount && !progress?.replay),
    saveToAccount,
    playAgain,
    stopReplay,
    toggleBookmark,
  };
}
