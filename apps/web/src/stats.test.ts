import { describe, expect, it } from "vitest";
import { computeStats, solvedOnTheDay, streaks } from "./stats";
import { emptyProgress, type PuzzleProgress } from "./storage/progressStore";

/** A daily record, solved at `solvedAt` (ISO) with `checks` checks, or unsolved. */
function daily(date: string, difficulty: number, solvedAt: string | null, checks = 1): PuzzleProgress {
  return { ...emptyProgress({ kind: "daily", date, difficulty }), solvedAt, checks };
}
const onDay = (date: string, difficulty = 1, checks = 1) => daily(date, difficulty, `${date}T12:00:00.000Z`, checks);

describe("streaks", () => {
  const days = (...d: string[]) => new Set(d);

  it("counts back from today, or from yesterday while today is still open", () => {
    expect(streaks(days("2026-11-08", "2026-11-09", "2026-11-10"), "2026-11-10").current).toBe(3);
    expect(streaks(days("2026-11-08", "2026-11-09"), "2026-11-10").current).toBe(2);
    expect(streaks(days("2026-11-07", "2026-11-08"), "2026-11-10").current).toBe(0); // missed the 9th
  });

  it("finds the best run anywhere, across month ends", () => {
    const s = streaks(days("2026-10-30", "2026-10-31", "2026-11-01", "2026-11-05"), "2026-11-10");
    expect(s.best).toBe(3);
    expect(streaks(days(), "2026-11-10")).toEqual({ current: 0, best: 0 });
  });
});

describe("solvedOnTheDay", () => {
  it("only counts solves on the puzzle's own UTC day", () => {
    expect(solvedOnTheDay(onDay("2026-11-10"))).toBe(true);
    expect(solvedOnTheDay(daily("2026-11-09", 1, "2026-11-10T08:00:00.000Z"))).toBe(false); // from the archive
    expect(solvedOnTheDay(daily("2026-11-10", 1, null))).toBe(false);
  });
});

describe("computeStats", () => {
  it("summarises each difficulty separately, plus random puzzles", () => {
    const records: PuzzleProgress[] = [
      onDay("2026-11-08", 1, 1),
      onDay("2026-11-09", 1, 3),
      onDay("2026-11-10", 1, 2),
      daily("2026-11-07", 1, "2026-11-10T09:00:00.000Z", 1), // archive catch-up
      daily("2026-11-06", 1, null, 2), // started, not solved
      onDay("2026-11-10", 2, 5),
      { ...emptyProgress({ kind: "random", seed: "abcd", difficulty: 1 }), solvedAt: "2026-11-10T10:00:00.000Z" },
      emptyProgress({ kind: "random", seed: "efgh", difficulty: 0 }),
    ];
    const stats = computeStats(records, "2026-11-10");
    const medium = stats.daily.find((d) => d.difficulty === 1)!;
    expect(medium).toEqual({
      difficulty: 1,
      played: 5,
      solved: 4,
      currentStreak: 3, // the 7th was solved late, so it doesn't extend the streak
      bestStreak: 3,
      averageChecks: (1 + 3 + 2 + 1) / 4,
      firstTry: 2,
    });
    expect(stats.daily.find((d) => d.difficulty === 2)).toMatchObject({ solved: 1, currentStreak: 1 });
    expect(stats.daily.find((d) => d.difficulty === 0)).toMatchObject({ played: 0, averageChecks: null });
    expect(stats.random).toEqual({ played: 2, solved: 1 });
  });
});
