/**
 * Player progress records. The browser autosaves them locally. For signed-in
 * players the *account-level* part (solves, checks) syncs automatically, while
 * an unfinished board reaches the account only through an explicit Save
 * (ADR 0013). Both sides share these types, the upgrade path for old records
 * and the solve rule. See docs/client-storage.md.
 */

/** Which puzzle a progress record belongs to. */
export type PuzzleKey =
  /** The puzzle of a UTC day ("YYYY-MM-DD") at a difficulty. Counts for stats/streaks. */
  | { kind: "daily"; date: string; difficulty: number }
  /** A random puzzle, identified by its seed. */
  | { kind: "random"; seed: string; difficulty: number };

/** Stable string id for a key: the local storage key suffix and the server's key column. */
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
  /** 4: adds boardSavedAt/boardDirty. 3: adds puzzleFingerprint. 2: key has a `kind`. 1: key was { date, difficulty }. */
  schemaVersion: 4;
  key: PuzzleKey;
  /**
   * puzzleFingerprint() of the puzzle this board was drawn on, so it is never
   * shown on a different puzzle under the same key. null in records saved
   * before v3.
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
  /** The mask grid the server accepted; lets the server re-verify synced solves. */
  solvedCells: number[][] | null;
  /**
   * When this board was last saved to the account (server time), or null if
   * never. Identifies *which* saved version the local board is based on.
   */
  boardSavedAt: string | null;
  /** The board has edits that haven't been saved to the account. Device-local. */
  boardDirty: boolean;
}

export const CURRENT_SCHEMA_VERSION = 4 as const;

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
    boardSavedAt: null,
    boardDirty: false,
  };
}

/**
 * Upgrade older records to the current shape. Returns null for anything that
 * can't be understood, which callers treat as "no progress".
 */
export function migrateProgress(raw: unknown): PuzzleProgress | null {
  if (typeof raw !== "object" || raw === null) return null;
  let record = raw as Record<string, unknown>;
  // Each step upgrades one version, so any old record walks up to the current one.
  if (record.schemaVersion === 1) {
    // v1 keys were always daily puzzles: { date, difficulty }.
    record = { ...record, schemaVersion: 2, key: { kind: "daily", ...(record.key as object) } };
  }
  if (record.schemaVersion === 2) {
    // v2 records don't know which puzzle they were drawn on.
    record = { ...record, schemaVersion: 3, puzzleFingerprint: null };
  }
  if (record.schemaVersion === 3) {
    // v3 boards were never explicitly saved; anything drawn counts as unsaved.
    const board = record.board as BoardState | undefined;
    const drawn = (board?.edges?.length ?? 0) > 0 || Object.keys(board?.marks ?? {}).length > 0;
    record = { ...record, schemaVersion: 4, boardSavedAt: null, boardDirty: drawn };
  }
  if (record.schemaVersion !== CURRENT_SCHEMA_VERSION) return null; // unknown (e.g. newer) version
  return isProgressRecord(record) ? record : null;
}

export function isPuzzleKey(key: unknown): key is PuzzleKey {
  const k = key as Partial<Record<string, unknown>> | null;
  if (typeof k !== "object" || k === null || typeof k.difficulty !== "number") return false;
  if (k.kind === "daily") return typeof k.date === "string";
  if (k.kind === "random") return typeof k.seed === "string";
  return false;
}

/** Structural check of a current-version record (types only, not limits). */
export function isProgressRecord(value: unknown): value is PuzzleProgress {
  const p = value as PuzzleProgress;
  return (
    typeof p === "object" &&
    p !== null &&
    p.schemaVersion === CURRENT_SCHEMA_VERSION &&
    isPuzzleKey(p.key) &&
    (p.puzzleFingerprint === null || typeof p.puzzleFingerprint === "string") &&
    Array.isArray(p.board?.edges) &&
    typeof p.board?.marks === "object" &&
    p.board.marks !== null &&
    typeof p.startedAt === "string" &&
    typeof p.updatedAt === "string" &&
    typeof p.checks === "number" &&
    (p.solvedAt === null || typeof p.solvedAt === "string") &&
    (p.solvedCells === null || Array.isArray(p.solvedCells)) &&
    (p.boardSavedAt === null || typeof p.boardSavedAt === "string") &&
    typeof p.boardDirty === "boolean"
  );
}

/**
 * Two versions of the same puzzle's progress (e.g. phone and server): whose
 * solve counts? Used by both the browser and the server, so they always agree.
 * A solve beats no solve; of two solves the earlier wins (the first solve is
 * the real one); ties keep `a`. Null if neither is solved.
 */
export function betterSolve(a: PuzzleProgress, b: PuzzleProgress): PuzzleProgress | null {
  if (a.solvedAt && !b.solvedAt) return a;
  if (b.solvedAt && !a.solvedAt) return b;
  if (a.solvedAt && b.solvedAt) return b.solvedAt < a.solvedAt ? b : a;
  return null;
}

/** An empty board, as the account holds for puzzles never saved. */
export const EMPTY_BOARD: BoardState = Object.freeze({ edges: [], marks: {} }) as BoardState;

// ---- the account's merge rules (applied by the server) ----

/**
 * How the account combines incoming records (ADR 0013). Two kinds of writes:
 *
 *  - automatic (`mergeSummary`): account-level facts only: the solve (with
 *    its finished track), checks, start time. An unfinished board sent this
 *    way is ignored, so it never reaches the account without a Save.
 *  - explicit Save (`saveBoard`): also stores the unfinished board.
 */
export function mergeSummary(existing: PuzzleProgress | null, incoming: PuzzleProgress): PuzzleProgress {
  if (!existing) {
    return incoming.solvedAt
      ? { ...incoming, boardSavedAt: incoming.solvedAt, boardDirty: false }
      : { ...incoming, board: EMPTY_BOARD, boardSavedAt: null, boardDirty: false };
  }
  let merged: PuzzleProgress = {
    ...existing,
    puzzleFingerprint: existing.puzzleFingerprint ?? incoming.puzzleFingerprint,
    checks: Math.max(existing.checks, incoming.checks),
    startedAt: incoming.startedAt < existing.startedAt ? incoming.startedAt : existing.startedAt,
    updatedAt: incoming.updatedAt > existing.updatedAt ? incoming.updatedAt : existing.updatedAt,
    boardDirty: false,
  };
  if (betterSolve(existing, incoming) === incoming && incoming.solvedAt !== existing.solvedAt) {
    // A new (or earlier) solve: its finished track becomes the saved board.
    merged = {
      ...merged,
      solvedAt: incoming.solvedAt,
      solvedCells: incoming.solvedCells,
      board: incoming.board,
      boardSavedAt: incoming.solvedAt,
    };
  }
  return merged;
}

/** Explicit Save: everything mergeSummary does, plus the board. A solved puzzle's board is final. */
export function saveBoard(existing: PuzzleProgress | null, incoming: PuzzleProgress, now: Date): PuzzleProgress {
  const merged = mergeSummary(existing, incoming);
  if (merged.solvedAt) return merged;
  return { ...merged, board: incoming.board, boardSavedAt: now.toISOString(), updatedAt: incoming.updatedAt };
}

