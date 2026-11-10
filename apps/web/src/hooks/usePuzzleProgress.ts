import { puzzleFingerprint, type PuzzleLayout } from "@trackle/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { reconcileProgress } from "../storage/reconcile";
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
  /** Record a server check result. Saved immediately. */
  recordCheck(correct: boolean, cells: number[][]): void;
  clearBoard(): void;
  /** Whether the store can save to an account right now (signed in). */
  canSaveToAccount: boolean;
  /** Save the current board to the account; marks it saved unless edited meanwhile. */
  saveToAccount(): Promise<void>;
}

/**
 * Loads and saves one puzzle's progress through a ProgressStore. Board edits
 * are debounced; check results and page hide are saved right away.
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

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current) {
      void store.save(pending.current);
      pending.current = null;
    }
  }, [store]);

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
    });
    return () => {
      cancelled = true;
    };
  }, [store, id, fingerprint]);

  useEffect(() => {
    // pagehide: tab closed or navigated away; visibilitychange: phones often
    // background a page without ever firing pagehide.
    const onHidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, [flush]);

  const updateBoard = useCallback(
    (fn: (board: BoardState) => BoardState) => {
      const current = latest.current;
      if (!current || current.solvedAt) return;
      const board = fn(current.board);
      if (board === current.board) return;
      commit({ ...current, board, boardDirty: true, updatedAt: new Date().toISOString() }, false);
    },
    [commit],
  );

  const recordCheck = useCallback(
    (correct: boolean, cells: number[][]) => {
      const current = latest.current;
      if (!current || current.solvedAt) return;
      const now = new Date().toISOString();
      commit(
        {
          ...current,
          checks: current.checks + 1,
          updatedAt: now,
          solvedAt: correct ? now : null,
          solvedCells: correct ? cells : null,
        },
        true,
      );
    },
    [commit],
  );

  const clearBoard = useCallback(() => updateBoard(() => ({ edges: [], marks: {} })), [updateBoard]);

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
    updateBoard,
    recordCheck,
    clearBoard,
    canSaveToAccount: Boolean(store.signedIn && store.saveToAccount),
    saveToAccount,
  };
}
