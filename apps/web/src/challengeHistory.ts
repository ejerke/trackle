import { CHALLENGE_DIFFICULTY, POINTS_PER_TRACK_SQUARE, SYNC_GRACE_MINUTES, addDays, solvedUnaided } from "@trackle/shared";
import { solvedOnTheDay } from "./stats";
import type { PuzzleProgress } from "./storage/progressStore";

/**
 * The player's solved Challenges, from the progress records in this browser
 * (an account's records are here too once signed in). Pure, like stats.ts.
 *
 * Whether a solve scores follows the leaderboard's rule (ADR 0025,
 * apps/server/src/leaderboard/leaderboard.ts) as far as the browser can see
 * it: solved on its UTC day with no help, and the server's receipt from
 * before the day ended (plus the sync grace). The server has the final word;
 * a solve with no receipt is taken on the browser's word here.
 */
export interface ChallengeSolve {
  record: PuzzleProgress;
  date: string;
  /** Squares of track in the accepted answer. */
  trackSquares: number;
  /** What the puzzle is worth on its day. */
  points: number;
  /** Solved on its own day: it scores. Otherwise solved later (from the archive): no points. */
  scored: boolean;
}

export interface ChallengeHistory {
  /** Newest first. */
  solves: ChallengeSolve[];
  /** Points from every scoring solve. */
  points: number;
  /** Points from scoring solves in the current UTC month. */
  monthPoints: number;
  /** How many solves scored. */
  scoredCount: number;
}

/** Squares the track passes through: every square of the accepted answer that holds a piece. */
export function trackSquares(cells: number[][]): number {
  return cells.reduce((sum, row) => sum + row.filter((mask) => mask !== 0).length, 0);
}

/** The server's receipt came before the day ended, give or take the grace. No receipt: trust solvedAt. */
function confirmedOnTheDay(p: PuzzleProgress, date: string): boolean {
  if (!p.solveReceipt) return true;
  const end = new Date(`${addDays(date, 1)}T00:00:00Z`).getTime() + SYNC_GRACE_MINUTES * 60_000;
  return new Date(p.solveReceipt.at).getTime() < end;
}

export function challengeSolve(p: PuzzleProgress): ChallengeSolve | null {
  if (p.key.kind !== "daily" || p.key.difficulty !== CHALLENGE_DIFFICULTY || !p.solvedAt || !p.solvedCells) return null;
  const date = p.key.date;
  const squares = trackSquares(p.solvedCells);
  return {
    record: p,
    date,
    trackSquares: squares,
    points: POINTS_PER_TRACK_SQUARE * squares,
    scored: solvedUnaided(p) && solvedOnTheDay(p) && confirmedOnTheDay(p, date),
  };
}

export function challengeHistory(records: readonly PuzzleProgress[], today: string): ChallengeHistory {
  const solves = records
    .map(challengeSolve)
    .filter((s): s is ChallengeSolve => s !== null)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const month = today.slice(0, 7);
  const scored = solves.filter((s) => s.scored);
  return {
    solves,
    points: scored.reduce((sum, s) => sum + s.points, 0),
    monthPoints: scored.filter((s) => s.date.startsWith(month)).reduce((sum, s) => sum + s.points, 0),
    scoredCount: scored.length,
  };
}
