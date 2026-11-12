import {
  edgesFromMasks,
  emptyProgress,
  fixedEdges,
  isIsoDate,
  isRandomSeed,
  mergeSummary,
  migrateProgress,
  puzzleFingerprint,
  puzzleKeyId,
  totalHints,
  saveBoard,
  validateTrack,
  type PuzzleKey,
  type PuzzleLayout,
  type PuzzleProgress,
} from "@trackle/shared";
import type { Db } from "../db/connection.ts";
import { DIFFICULTIES } from "../puzzles/difficulty.ts";
import type { PuzzleRepository } from "../puzzles/repository.ts";

/**
 * A stored record, upgraded to the current version: rows written by older
 * code keep their old shape in record_json. null if it can't be understood.
 */
function parseStored(json: string): PuzzleProgress | null {
  return migrateProgress(JSON.parse(json));
}

/**
 * Server side of progress sync (ADR 0013): storage, solve verification, key
 * validation. The merge rules themselves (mergeSummary, saveBoard) live in
 * @trackle/shared so the browser's tests can use the very same functions.
 */
export class ProgressSync {
  private readonly db: Db;
  private readonly puzzles: PuzzleRepository;
  private readonly now: () => Date;

  constructor(db: Db, puzzles: PuzzleRepository, now: () => Date) {
    this.db = db;
    this.puzzles = puzzles;
    this.now = now;
  }

  get(userId: number, key: PuzzleKey): PuzzleProgress | null {
    const json = this.db
      .prepare("SELECT record_json FROM user_progress WHERE user_id = ? AND key_id = ?")
      .pluck()
      .get(userId, puzzleKeyId(key)) as string | undefined;
    return json ? parseStored(json) : null;
  }

  list(userId: number): PuzzleProgress[] {
    return (
      this.db.prepare("SELECT record_json FROM user_progress WHERE user_id = ?").pluck().all(userId) as string[]
    )
      .map(parseStored)
      .filter((p): p is PuzzleProgress => p !== null);
  }

  /** Automatic sync of account-level facts. Returns the stored version of each record. */
  sync(userId: number, incoming: PuzzleProgress[]): PuzzleProgress[] {
    return this.db.transaction(() =>
      incoming.map((record) => this.write(userId, record, (existing, r) => mergeSummary(existing, r))),
    )();
  }

  /** Explicit Save of one record, board included. Returns the stored version. */
  save(userId: number, record: PuzzleProgress): PuzzleProgress {
    const now = this.now();
    return this.db.transaction(() => this.write(userId, record, (existing, r) => saveBoard(existing, r, now)))();
  }

  /**
   * Record help the server just gave a signed-in player (ADR 0014): one more
   * track or "no track" hint, or the answer shown. Recorded here, not trusted to the client, so
   * the account's "solved it yourself" can't be faked by a quiet browser.
   * No change once the puzzle is solved or already revealed.
   */
  recordHelp(userId: number, key: PuzzleKey, layout: PuzzleLayout, solution: number[][], help: "hint" | "emptyHint" | "answer"): void {
    const now = this.now().toISOString();
    this.db.transaction(() =>
      this.write(userId, emptyProgress(key, puzzleFingerprint(layout), this.now()), (existing) => {
        const base = existing ?? emptyProgress(key, puzzleFingerprint(layout), this.now());
        if (base.solvedAt || base.revealedAt) return base;
        const fixed = fixedEdges(layout);
        const incoming: PuzzleProgress =
          help === "hint"
            ? { ...base, hintsUsed: base.hintsUsed + 1, updatedAt: now }
            : help === "emptyHint"
              ? { ...base, emptyHintsUsed: base.emptyHintsUsed + 1, updatedAt: now }
              : {
                ...base,
                revealedAt: now,
                updatedAt: now,
                board: { edges: edgesFromMasks(layout.width, layout.height, solution).filter((e) => !fixed.has(e)), marks: {} },
              };
        return mergeSummary(existing, incoming);
      }),
    )();
  }

  delete(userId: number, keyId: string): void {
    this.db.prepare("DELETE FROM user_progress WHERE user_id = ? AND key_id = ?").run(userId, keyId);
  }

  private write(
    userId: number,
    raw: PuzzleProgress,
    combine: (existing: PuzzleProgress | null, incoming: PuzzleProgress) => PuzzleProgress,
  ): PuzzleProgress {
    const record = this.verified(raw);
    const keyId = puzzleKeyId(record.key);
    const json = this.db
      .prepare("SELECT record_json FROM user_progress WHERE user_id = ? AND key_id = ?")
      .pluck()
      .get(userId, keyId) as string | undefined;
    const stored = combine(json ? parseStored(json) : null, record);
    this.db
      .prepare(
        `INSERT INTO user_progress (user_id, key_id, record_json, updated_at, solved_at, hints_used, revealed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, key_id) DO UPDATE SET
           record_json = excluded.record_json, updated_at = excluded.updated_at, solved_at = excluded.solved_at,
           hints_used = excluded.hints_used, revealed_at = excluded.revealed_at`,
      )
      // hints_used: help of both kinds, so `hints_used = 0` still means "no hints".
      .run(userId, keyId, JSON.stringify(stored), stored.updatedAt, stored.solvedAt, totalHints(stored), stored.revealedAt);
    return stored;
  }

  /**
   * A daily solve only counts if its saved answer solves the stored puzzle; a
   * failed check drops the solve. Random puzzles aren't stored server-side, so
   * their solves can't be checked and aren't trusted beyond personal stats.
   */
  private verified(record: PuzzleProgress): PuzzleProgress {
    if (!record.solvedAt || record.key.kind !== "daily") return record;
    const puzzle = this.puzzles.find(record.key.date, record.key.difficulty);
    const ok = puzzle !== null && record.solvedCells !== null && validateTrack(puzzle.puzzle, record.solvedCells).ok;
    return ok ? record : { ...record, solvedAt: null, solvedCells: null };
  }
}

/** Keys must name a real kind of puzzle: an ISO date or valid seed, at a known difficulty. */
export function isValidSyncKey(record: PuzzleProgress): boolean {
  const { key } = record;
  if (DIFFICULTIES[key.difficulty] === undefined) return false;
  if (key.kind === "daily") return isIsoDate(key.date) && !("seed" in key);
  return isRandomSeed(key.seed) && !("date" in key);
}
