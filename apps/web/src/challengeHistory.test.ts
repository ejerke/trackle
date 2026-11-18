import { CHALLENGE_DIFFICULTY } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { challengeHistory, challengeSolve, trackSquares } from "./challengeHistory";
import { emptyProgress, type PuzzleProgress } from "./storage/progressStore";

// A 3-square track: 3 squares × 5 points.
const CELLS = [
  [6, 10, 0],
  [5, 0, 0],
];

function challenge(date: string, solvedAt: string | null, extra: Partial<PuzzleProgress> = {}): PuzzleProgress {
  return {
    ...emptyProgress({ kind: "daily", date, difficulty: CHALLENGE_DIFFICULTY }),
    solvedAt,
    solvedCells: solvedAt ? CELLS : null,
    solveReceipt: solvedAt ? { at: solvedAt, sig: "x" } : null,
    ...extra,
  };
}

describe("challengeSolve", () => {
  it("counts the track's squares and scores a solve on its day", () => {
    expect(trackSquares(CELLS)).toBe(3);
    expect(challengeSolve(challenge("2026-11-14", "2026-11-14T20:00:00.000Z"))).toMatchObject({
      date: "2026-11-14",
      trackSquares: 3,
      points: 15,
      scored: true,
    });
  });

  it("gives no points for a solve on a later day", () => {
    expect(challengeSolve(challenge("2026-11-14", "2026-11-15T08:00:00.000Z"))?.scored).toBe(false);
  });

  it("trusts the server's receipt over the browser's clock, with the sync grace", () => {
    const late = { at: "2026-11-15T00:30:00.000Z", sig: "x" };
    const graced = { at: "2026-11-15T00:05:00.000Z", sig: "x" };
    expect(challengeSolve(challenge("2026-11-14", "2026-11-14T23:59:00.000Z", { solveReceipt: late }))?.scored).toBe(false);
    expect(challengeSolve(challenge("2026-11-14", "2026-11-14T23:59:00.000Z", { solveReceipt: graced }))?.scored).toBe(true);
  });

  it("ignores unsolved Challenges and other levels", () => {
    expect(challengeSolve(challenge("2026-11-14", null))).toBeNull();
    const other = { ...challenge("2026-11-14", "2026-11-14T20:00:00.000Z"), key: { kind: "daily", date: "2026-11-14", difficulty: 1 } as const };
    expect(challengeSolve(other)).toBeNull();
  });
});

describe("challengeHistory", () => {
  it("lists newest first and adds up points, all time and this month", () => {
    const h = challengeHistory(
      [
        challenge("2026-10-30", "2026-10-30T10:00:00.000Z"),
        challenge("2026-11-14", "2026-11-14T10:00:00.000Z"),
        challenge("2026-11-02", "2026-11-03T10:00:00.000Z"), // late
        challenge("2026-11-16", null),
      ],
      "2026-11-18",
    );
    expect(h.solves.map((s) => s.date)).toEqual(["2026-11-14", "2026-11-02", "2026-10-30"]);
    expect(h).toMatchObject({ points: 30, monthPoints: 15, scoredCount: 2 });
  });
});
