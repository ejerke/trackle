import { LEVEL_ORDER, addDays, played, solvedUnaided } from "@trackle/shared";
import type { PuzzleProgress } from "./storage/progressStore";

/**
 * Personal statistics, computed from the progress records in the browser.
 * Pure functions, so they're easy to test and will work unchanged on records
 * that come from an account later (docs/client-storage.md#path-to-accounts).
 */
export interface DifficultyStats {
  difficulty: number;
  /** Daily puzzles started (any interaction). */
  played: number;
  /** Solved, with or without hints (a shown answer never counts as solved). */
  solved: number;
  /** Solved on your own: no hints, answer never shown. */
  unaided: number;
  /** Answer shown. */
  revealed: number;
  /** Fastest time (ms) of the timed puzzles solved on your own; null with none. */
  bestTimeMs: number | null;
  /** Average time (ms) of the timed puzzles solved on your own; null with none. */
  averageTimeMs: number | null;
}

/** The player's streak: days on which at least one daily puzzle, any difficulty, was solved on the day itself. */
export interface Streak {
  /** Consecutive UTC days up to today, or up to yesterday while today is still open. */
  current: number;
  best: number;
  /** Whether today already counts; if not, the current streak ends unless something is solved today. */
  today: boolean;
}

export interface PlayerStats {
  streak: Streak;
  daily: DifficultyStats[];
  random: { played: number; solved: number };
}

/**
 * Solved on the puzzle's own UTC day: what streaks count. Catching up on old
 * days from the archive counts as solved, but doesn't build a streak.
 */
export function solvedOnTheDay(p: PuzzleProgress): boolean {
  return p.key.kind === "daily" && p.solvedAt !== null && p.solvedAt.slice(0, 10) === p.key.date;
}

export function streaks(days: ReadonlySet<string>, today: string): { current: number; best: number } {
  // Current: a streak is still alive today if yesterday was solved.
  let current = 0;
  let day = days.has(today) ? today : addDays(today, -1);
  while (days.has(day)) {
    current++;
    day = addDays(day, -1);
  }

  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const d of [...days].sort()) {
    run = previous !== null && addDays(previous, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    previous = d;
  }
  return { current, best };
}

export function computeStats(records: readonly PuzzleProgress[], today: string): PlayerStats {
  const daily = LEVEL_ORDER.map((difficulty): DifficultyStats => {
    // Records that only hold a bookmark weren't played.
    const mine = records.filter((p) => p.key.kind === "daily" && p.key.difficulty === difficulty && played(p));
    const solved = mine.filter((p) => p.solvedAt !== null);
    // Times only count without help, and solves from before timing (timeMs 0) aren't timed.
    const times = solved.filter((p) => solvedUnaided(p) && p.timeMs > 0).map((p) => p.timeMs);
    return {
      difficulty,
      played: mine.length,
      solved: solved.length,
      unaided: solved.filter(solvedUnaided).length,
      revealed: mine.filter((p) => p.revealedAt !== null).length,
      bestTimeMs: times.length ? Math.min(...times) : null,
      averageTimeMs: times.length ? times.reduce((sum, t) => sum + t, 0) / times.length : null,
    };
  });
  const onTheDay = new Set(records.filter(solvedOnTheDay).map((p) => (p.key.kind === "daily" ? p.key.date : "")));
  const streak = { ...streaks(onTheDay, today), today: onTheDay.has(today) };
  const random = records.filter((p) => p.key.kind === "random" && played(p));
  return { streak, daily, random: { played: random.length, solved: random.filter((p) => p.solvedAt !== null).length } };
}
