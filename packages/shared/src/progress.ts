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
  /**
   * "r:c" of squares revealed by hints: their piece (or "no track" mark) is
   * on the board and can't be changed or cleared. Absent = none.
   */
  locked?: string[];
}

/**
 * The player's bookmark on a puzzle. Kept (not deleted) when turned off,
 * so the newer of two changes wins when devices meet. Compares device clocks,
 * which is fine for a bookmark (boards never do, ADR 0013).
 */
export interface Bookmark {
  on: boolean;
  /** When it was last switched on or off, or renamed (client clock). */
  at: string;
  /** The player's own name for it, to tell bookmarks apart. Absent: none. */
  name?: string;
}

/** Longest bookmark name, in characters. */
export const BOOKMARK_NAME_MAX = 40;

/** A name as typed, cleaned up: trimmed, at most BOOKMARK_NAME_MAX characters; undefined when empty. */
export function cleanBookmarkName(name: string): string | undefined {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, BOOKMARK_NAME_MAX);
  return clean === "" ? undefined : clean;
}

/**
 * Playing a finished (solved or revealed) puzzle again: "Try again". It has its
 * own board, hints, answer and time, so the first attempt's facts (the solve,
 * hints used, answer shown: what stats and streaks count) are never touched.
 * A replay never counts for anything. Device-local: never synced (ADR 0024).
 */
export interface Replay {
  startedAt: string;
  board: BoardState;
  hintsUsed: number;
  emptyHintsUsed: number;
  solvedAt: string | null;
  revealedAt: string | null;
  timeMs: number;
}

/**
 * The server's signed word that it accepted this daily solve at `at` (its
 * own clock). Handed out by the daily check; lets a solve made signed out, or
 * synced late, still prove it happened on the day (ADR 0025).
 */
export interface SolveReceipt {
  /** Server time of the correct check (ISO). */
  at: string;
  /** HMAC-SHA256 over the puzzle key and `at`, base64url. Only the server can make or check it. */
  sig: string;
}

export interface PuzzleProgress {
  /**
   * 9: adds solveReceipt. 8: adds bookmark/replay. 7: adds emptyHintsUsed. 6: adds timeMs. 5: adds hintsUsed/revealedAt. 4: adds boardSavedAt/boardDirty.
   * 3: adds puzzleFingerprint. 2: key has a `kind`. 1: key was { date, difficulty }.
   */
  schemaVersion: 9;
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
  /**
   * How many times the finished-looking track was sent to the server for
   * checking. Since v6 that happens automatically, so this is almost always 1.
   */
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
  /** Track hints given for this puzzle (pieces revealed). Only ever grows. */
  hintsUsed: number;
  /** "No track" hints given for this puzzle. Only ever grows. */
  emptyHintsUsed: number;
  /** When the answer was shown, or null. A revealed puzzle can't be solved any more. */
  revealedAt: string | null;
  /**
   * Active solving time in milliseconds: the clock runs from the first move
   * while the page is visible, and stops at the solve. Frozen once solved.
   * 0 on a solved record means "not timed" (solved before v6).
   */
  timeMs: number;
  /** The bookmark, or null if never set. Synced. */
  bookmark: Bookmark | null;
  /** A "Try again" in progress or finished, or null. Device-local, never synced. */
  replay: Replay | null;
  /** The server's receipt for the solve (daily puzzles), or null. Goes with `solvedAt`. */
  solveReceipt: SolveReceipt | null;
}

export const CURRENT_SCHEMA_VERSION = 9 as const;

/** Solved without any help: no hints and the answer never shown. */
export function solvedUnaided(p: PuzzleProgress): boolean {
  return p.solvedAt !== null && totalHints(p) === 0 && p.revealedAt === null;
}

/** Bookmarked by the player. */
export function isBookmarked(p: PuzzleProgress): boolean {
  return p.bookmark?.on === true;
}

/**
 * The player actually did something with this puzzle. A record can also exist
 * only because the puzzle was bookmarked; that isn't playing it.
 */
export function played(p: PuzzleProgress): boolean {
  return (
    p.solvedAt !== null ||
    p.revealedAt !== null ||
    totalHints(p) > 0 ||
    p.checks > 0 ||
    p.timeMs > 0 ||
    p.board.edges.length > 0 ||
    Object.keys(p.board.marks).length > 0
  );
}

/** Of two bookmarks, the more recent change (ties keep `a`). */
export function newerBookmark(a: Bookmark | null, b: Bookmark | null): Bookmark | null {
  if (!a || !b) return a ?? b;
  return b.at > a.at ? b : a;
}

/** Hints of both kinds. */
export function totalHints(p: PuzzleProgress): number {
  return p.hintsUsed + p.emptyHintsUsed;
}

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
    hintsUsed: 0,
    emptyHintsUsed: 0,
    revealedAt: null,
    timeMs: 0,
    bookmark: null,
    replay: null,
    solveReceipt: null,
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
  if (record.schemaVersion === 4) {
    // Hints and answers didn't exist before v5.
    record = { ...record, schemaVersion: 5, hintsUsed: 0, revealedAt: null };
  }
  if (record.schemaVersion === 5) {
    // Untimed: unfinished boards start counting from the next move.
    record = { ...record, schemaVersion: 6, timeMs: 0 };
  }
  if (record.schemaVersion === 6) {
    // "No track" hints didn't exist before v7.
    record = { ...record, schemaVersion: 7, emptyHintsUsed: 0 };
  }
  if (record.schemaVersion === 7) {
    // Bookmarks and "Try again" didn't exist before v8.
    record = { ...record, schemaVersion: 8, bookmark: null, replay: null };
  }
  if (record.schemaVersion === 8) {
    // Solve receipts didn't exist before v9.
    record = { ...record, schemaVersion: 9, solveReceipt: null };
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
    (p.board.locked === undefined || Array.isArray(p.board.locked)) &&
    typeof p.startedAt === "string" &&
    typeof p.updatedAt === "string" &&
    typeof p.checks === "number" &&
    (p.solvedAt === null || typeof p.solvedAt === "string") &&
    (p.solvedCells === null || Array.isArray(p.solvedCells)) &&
    (p.boardSavedAt === null || typeof p.boardSavedAt === "string") &&
    typeof p.boardDirty === "boolean" &&
    typeof p.hintsUsed === "number" &&
    typeof p.emptyHintsUsed === "number" &&
    (p.revealedAt === null || typeof p.revealedAt === "string") &&
    typeof p.timeMs === "number" &&
    (p.bookmark === null ||
      (typeof p.bookmark === "object" &&
        typeof p.bookmark.on === "boolean" &&
        typeof p.bookmark.at === "string" &&
        (p.bookmark.name === undefined || typeof p.bookmark.name === "string"))) &&
    (p.replay === null || isReplay(p.replay)) &&
    (p.solveReceipt === null ||
      (typeof p.solveReceipt === "object" && typeof p.solveReceipt.at === "string" && typeof p.solveReceipt.sig === "string"))
  );
}

function isReplay(value: unknown): value is Replay {
  const r = value as Replay;
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.startedAt === "string" &&
    Array.isArray(r.board?.edges) &&
    typeof r.board?.marks === "object" &&
    r.board.marks !== null &&
    (r.board.locked === undefined || Array.isArray(r.board.locked)) &&
    typeof r.hintsUsed === "number" &&
    typeof r.emptyHintsUsed === "number" &&
    (r.solvedAt === null || typeof r.solvedAt === "string") &&
    (r.revealedAt === null || typeof r.revealedAt === "string") &&
    typeof r.timeMs === "number"
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
 * The time to keep when two versions of a record meet: a solve's time is
 * final; otherwise the longer one (each device only ever adds to it).
 */
export function mergedTime(merged: PuzzleProgress, a: PuzzleProgress | null, b: PuzzleProgress): number {
  if (merged.solvedAt) return merged.solvedAt === b.solvedAt ? b.timeMs : (a?.timeMs ?? b.timeMs);
  return Math.max(a?.timeMs ?? 0, b.timeMs);
}

const earliest = (a: string | null, b: string | null) => (a && b ? (a < b ? a : b) : (a ?? b));

/**
 * How the account combines incoming records (ADR 0013, 0014). Two kinds of writes:
 *
 *  - automatic (`mergeSummary`): account-level facts only: the solve (with
 *    its finished track and time), checks, hints, a shown answer, start time. An
 *    unfinished board sent this way is ignored, so it never reaches the
 *    account without a Save.
 *  - explicit Save (`saveBoard`): also stores the unfinished board.
 *
 * The solve's receipt travels with the solve that counts.
 *
 * Help can't be undone: hint counts only grow, a shown answer stays shown,
 * and a solve made after the answer was shown doesn't count. The bookmark
 * mark: the more recent change wins. A replay ("Try again") is device-local,
 * so the account never keeps one.
 */
export function mergeSummary(existing: PuzzleProgress | null, incoming: PuzzleProgress): PuzzleProgress {
  const base: PuzzleProgress = existing
    ? {
        ...existing,
        puzzleFingerprint: existing.puzzleFingerprint ?? incoming.puzzleFingerprint,
        checks: Math.max(existing.checks, incoming.checks),
        startedAt: incoming.startedAt < existing.startedAt ? incoming.startedAt : existing.startedAt,
        updatedAt: incoming.updatedAt > existing.updatedAt ? incoming.updatedAt : existing.updatedAt,
      }
    : { ...incoming, board: EMPTY_BOARD, boardSavedAt: null, solvedAt: null, solvedCells: null, revealedAt: null, solveReceipt: null };

  let merged: PuzzleProgress = {
    ...base,
    boardDirty: false,
    hintsUsed: Math.max(existing?.hintsUsed ?? 0, incoming.hintsUsed),
    emptyHintsUsed: Math.max(existing?.emptyHintsUsed ?? 0, incoming.emptyHintsUsed),
    revealedAt: earliest(existing?.revealedAt ?? null, incoming.revealedAt),
    bookmark: newerBookmark(existing?.bookmark ?? null, incoming.bookmark),
    replay: null,
  };

  const solveCounts = !merged.revealedAt || (incoming.solvedAt !== null && incoming.solvedAt < merged.revealedAt);
  const newSolve =
    incoming.solvedAt !== null && (!existing || (betterSolve(existing, incoming) === incoming && incoming.solvedAt !== existing.solvedAt));
  if (newSolve && solveCounts) {
    // A new (or earlier) solve: its finished track becomes the saved board.
    merged = {
      ...merged,
      solvedAt: incoming.solvedAt,
      solvedCells: incoming.solvedCells,
      solveReceipt: incoming.solveReceipt,
      board: incoming.board,
      boardSavedAt: incoming.solvedAt,
    };
  } else if (!merged.solvedAt && merged.revealedAt && merged.revealedAt === incoming.revealedAt && existing?.revealedAt !== incoming.revealedAt) {
    // Newly shown answer: the board shows the solution from now on.
    merged = { ...merged, board: incoming.board, boardSavedAt: incoming.revealedAt };
  }
  return { ...merged, timeMs: mergedTime(merged, existing, incoming) };
}

/** Explicit Save: everything mergeSummary does, plus the board. A solved or revealed puzzle's board is final. */
export function saveBoard(existing: PuzzleProgress | null, incoming: PuzzleProgress, now: Date): PuzzleProgress {
  const merged = mergeSummary(existing, incoming);
  if (merged.solvedAt || merged.revealedAt) return merged;
  return { ...merged, board: incoming.board, boardSavedAt: now.toISOString(), updatedAt: incoming.updatedAt };
}
