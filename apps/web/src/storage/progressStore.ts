/**
 * Player progress persistence.
 *
 * UI code depends only on the `ProgressStore` interface, never on localStorage
 * directly. Today the implementation is `LocalProgressStore`; when accounts are
 * added, a remote/synced implementation can be swapped in at startup without
 * touching components. See docs/client-storage.md and docs/adr/0007.
 */

/** Which puzzle a progress record belongs to. */
export type PuzzleKey =
  /** The puzzle of a UTC day ("YYYY-MM-DD") at a difficulty. Counts for future stats/streaks. */
  | { kind: "daily"; date: string; difficulty: number }
  /** A random puzzle, identified by its seed. */
  | { kind: "random"; seed: string; difficulty: number };

/** Stable string id for a key; also the storage key suffix. */
export function puzzleKeyId(key: PuzzleKey): string {
  // Daily ids keep the original v1 layout ("2026-11-10:1") so old saves stay where they are.
  return key.kind === "daily" ? `${key.date}:${key.difficulty}` : `random:${key.difficulty}:${key.seed}`;
}

export type CellMark = "track" | "empty";

export interface BoardState {
  /** Player-placed track segments: "h:r:c" = (r,c)-(r,c+1), "v:r:c" = (r,c)-(r+1,c). */
  edges: string[];
  /** "r:c" -> mark. */
  marks: Record<string, CellMark>;
}

export interface PuzzleProgress {
  /** 3: adds puzzleFingerprint. 2: key has a `kind`. 1: key was always { date, difficulty }. */
  schemaVersion: 3;
  key: PuzzleKey;
  /**
   * puzzleFingerprint() of the puzzle this board was drawn on, so it is never
   * shown on a different puzzle under the same key. null in records saved
   * before v3 (checked against the puzzle instead, see usePuzzleProgress).
   */
  puzzleFingerprint: string | null;
  board: BoardState;
  /** ISO timestamp of first interaction (client clock). */
  startedAt: string;
  /** ISO timestamp of last change (client clock). */
  updatedAt: string;
  /** Number of times the player pressed "Check". */
  checks: number;
  /** Set only after the server answered `correct: true`. */
  solvedAt: string | null;
  /** The mask grid the server accepted, kept so a future account import can re-verify it. */
  solvedCells: number[][] | null;
}

export interface ProgressStore {
  get(key: PuzzleKey): Promise<PuzzleProgress | null>;
  save(progress: PuzzleProgress): Promise<void>;
  delete(key: PuzzleKey): Promise<void>;
  /** Every stored puzzle: daily ones newest date first, then random ones most recently played first. */
  list(): Promise<PuzzleProgress[]>;
}

export const CURRENT_SCHEMA_VERSION = 3 as const;

export function emptyProgress(key: PuzzleKey, fingerprint: string | null = null, now: Date = new Date()): PuzzleProgress {
  const iso = now.toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    key,
    puzzleFingerprint: fingerprint,
    board: { edges: [], marks: {} },
    startedAt: iso,
    updatedAt: iso,
    checks: 0,
    solvedAt: null,
    solvedCells: null,
  };
}
