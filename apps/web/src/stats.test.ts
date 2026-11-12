import { describe, expect, it } from "vitest";
import { computeStats, solvedOnTheDay, streaks } from "./stats";
import { emptyProgress, type PuzzleProgress } from "./storage/progressStore";

/** A daily record, solved at `solvedAt` (ISO) in `timeMs`, or unsolved. */
function daily(date: string, difficulty: number, solvedAt: string | null, timeMs = 60_000): PuzzleProgress {
  return { ...emptyProgress({ kind: "daily", date, difficulty }), solvedAt, timeMs };
}
const onDay = (date: string, difficulty = 1, timeMs = 60_000) => daily(date, difficulty, `${date}T12:00:00.000Z`, timeMs);

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
      onDay("2026-11-08", 1, 60_000),
      onDay("2026-11-09", 1, 180_000),
      { ...onDay("2026-11-10", 1, 20_000), hintsUsed: 2 }, // solved with hints: still solved, but no time
      { ...daily("2026-11-05", 1, null), revealedAt: "2026-11-05T10:00:00.000Z" }, // answer shown
      daily("2026-11-07", 1, "2026-11-10T09:00:00.000Z", 0), // archive catch-up, solved before timing
      daily("2026-11-06", 1, null, 5_000), // started, not solved
      onDay("2026-11-10", 2, 90_000),
      { ...emptyProgress({ kind: "random", seed: "abcd", difficulty: 1 }), solvedAt: "2026-11-10T10:00:00.000Z" },
      emptyProgress({ kind: "random", seed: "efgh", difficulty: 0 }),
    ];
    const stats = computeStats(records, "2026-11-10");
    const medium = stats.daily.find((d) => d.difficulty === 1)!;
    expect(medium).toEqual({
      difficulty: 1,
      played: 6,
      solved: 4,
      unaided: 3,
      revealed: 1,
      bestTimeMs: 60_000,
      averageTimeMs: 120_000,
    });
    expect(stats.daily.find((d) => d.difficulty === 2)).toMatchObject({ solved: 1 });
    expect(stats.daily.find((d) => d.difficulty === 0)).toMatchObject({ played: 0, bestTimeMs: null, averageTimeMs: null });
    expect(stats.random).toEqual({ played: 2, solved: 1 });
  });

  it("counts one streak across all difficulties", () => {
    const records: PuzzleProgress[] = [
      onDay("2026-11-07", 0),
      onDay("2026-11-08", 2), // a different level still keeps the streak going
      onDay("2026-11-09", 1),
      onDay("2026-11-09", 3), // two solves on one day count once
      daily("2026-11-06", 1, "2026-11-09T08:00:00.000Z"), // archive catch-up doesn't fill a gap
      { ...daily("2026-11-05", 1, null), revealedAt: "2026-11-05T10:00:00.000Z" }, // answer shown: not a streak day
    ];
    expect(computeStats(records, "2026-11-10").streak).toEqual({ current: 3, best: 3, today: false });
    expect(computeStats([...records, onDay("2026-11-10", 0)], "2026-11-10").streak).toEqual({ current: 4, best: 4, today: true });
    expect(computeStats(records, "2026-11-11").streak.current).toBe(0);
  });
});
