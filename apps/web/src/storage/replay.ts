import type { PuzzleLayout, PuzzleProgress, Replay } from "@trackle/shared";
import { boardMasks } from "../board/model";

/**
 * "Try again" (ADR 0024): playing a finished puzzle once more. The replay
 * lives in `record.replay`, next to the first attempt, which stays exactly as
 * it was: its solve, hints, shown answer and time are what stats and streaks
 * count, so a replay can never make a puzzle look solved, or solved without
 * help.
 *
 * The game code works on "the attempt on screen" as an ordinary record:
 * `currentAttempt` builds it, `withAttempt` puts an edited one back.
 */

/** The attempt being played: the replay if there is one, else the record itself. */
export function currentAttempt(record: PuzzleProgress): PuzzleProgress {
  const r = record.replay;
  if (!r) return record;
  return {
    ...record,
    startedAt: r.startedAt,
    board: r.board,
    hintsUsed: r.hintsUsed,
    emptyHintsUsed: r.emptyHintsUsed,
    solvedAt: r.solvedAt,
    revealedAt: r.revealedAt,
    timeMs: r.timeMs,
    // A replay is never saved to the account, so there's nothing unsaved.
    boardDirty: false,
  };
}

/**
 * Store an edited attempt. During a replay only the replay's own fields are
 * taken; everything else the attempt says (checks, solvedCells...) is ignored,
 * so the first attempt can't change.
 */
export function withAttempt(record: PuzzleProgress, attempt: PuzzleProgress): PuzzleProgress {
  if (!record.replay) return attempt;
  const replay: Replay = {
    startedAt: record.replay.startedAt,
    board: attempt.board,
    hintsUsed: attempt.hintsUsed,
    emptyHintsUsed: attempt.emptyHintsUsed,
    solvedAt: attempt.solvedAt,
    revealedAt: attempt.revealedAt,
    timeMs: attempt.timeMs,
  };
  return { ...record, updatedAt: attempt.updatedAt, replay };
}

/** The first attempt is over (solved, or the answer shown): "Try again" is offered. */
export function canReplay(record: PuzzleProgress): boolean {
  return record.solvedAt !== null || record.revealedAt !== null;
}

/** Start (or start over) a replay: empty board, fresh hints, clock at zero. */
export function startReplay(record: PuzzleProgress, now: Date = new Date()): PuzzleProgress {
  if (!canReplay(record)) return record;
  return {
    ...record,
    replay: {
      startedAt: now.toISOString(),
      board: { edges: [], marks: {} },
      hintsUsed: 0,
      emptyHintsUsed: 0,
      solvedAt: null,
      revealedAt: null,
      timeMs: 0,
    },
  };
}

/**
 * The solution, from the record itself: the accepted track of a solve, or the
 * answer that was shown. Lets a replay offer "Show answer" on every level
 * without asking the server, which (rightly) never shows Hard answers.
 */
export function knownSolution(record: PuzzleProgress, layout: PuzzleLayout): number[][] | null {
  if (record.solvedCells) return record.solvedCells;
  if (record.revealedAt) return boardMasks(layout, record.board);
  return null;
}
