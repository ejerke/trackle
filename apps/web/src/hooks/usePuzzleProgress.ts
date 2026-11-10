import { useCallback, useEffect, useRef, useState } from "react";
import {
  emptyProgress,
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
}

/**
 * Loads and saves one puzzle's progress through a ProgressStore. Board edits
 * are debounced; check results and page hide are saved right away.
 */
export function usePuzzleProgress(store: ProgressStore, key: PuzzleKey): PuzzleProgressApi {
  const [progress, setProgress] = useState<PuzzleProgress | null>(null);
  // The latest value, so several edits in one event chain correctly.
  const latest = useRef<PuzzleProgress | null>(null);
  const pending = useRef<PuzzleProgress | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Effects depend on the key's id (a string), so a new-but-equal key object doesn't reload.
  const id = puzzleKeyId(key);
  const keyRef = useRef(key);
  keyRef.current = key;

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
      const loaded = stored ?? emptyProgress(current);
      latest.current = loaded;
      setProgress(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [store, id]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  const updateBoard = useCallback(
    (fn: (board: BoardState) => BoardState) => {
      const current = latest.current;
      if (!current || current.solvedAt) return;
      const board = fn(current.board);
      if (board === current.board) return;
      commit({ ...current, board, updatedAt: new Date().toISOString() }, false);
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

  return { progress, updateBoard, recordCheck, clearBoard };
}
