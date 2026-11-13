import { E, N, S, W, emptyProgress, mergeSummary, solvedUnaided, type PuzzleLayout, type PuzzleProgress } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { computeStats } from "../stats";
import { canReplay, currentAttempt, knownSolution, startReplay, withAttempt } from "./replay";
import { toSummary } from "./syncMerge";

const key = { kind: "daily", date: "2026-11-10", difficulty: 2 } as const;
const solution = [[W | E, W | S], [0, N | S]];
const layout: PuzzleLayout = {
  width: 2,
  height: 2,
  rowClues: [2, 1],
  colClues: [1, 2],
  endpoints: [{ row: 0, col: 0, dir: W }, { row: 1, col: 1, dir: S }],
  hints: [],
};
// A fixed start time: records made a millisecond apart must still compare equal.
const STARTED = new Date("2026-11-10T08:00:00Z");
const first = (over: Partial<PuzzleProgress>): PuzzleProgress => ({ ...emptyProgress(key, "fp", STARTED), checks: 1, timeMs: 90_000, ...over });
const revealed = first({ revealedAt: "2026-11-10T10:00:00.000Z", hintsUsed: 5, board: { edges: ["h:0:0", "v:0:1"], marks: {} } });
const solvedWithHints = first({ solvedAt: "2026-11-10T10:00:00.000Z", solvedCells: solution, hintsUsed: 2 });

/** Play a replay to a solve with no hints, the way the game hook does. */
function replayAndSolve(record: PuzzleProgress): PuzzleProgress {
  const replaying = startReplay(record, new Date("2026-11-10T11:00:00Z"));
  const attempt = currentAttempt(replaying);
  return withAttempt(replaying, { ...attempt, checks: attempt.checks + 1, solvedAt: "2026-11-10T11:02:00.000Z", solvedCells: solution, timeMs: 20_000 });
}

describe("Try again", () => {
  it("is offered only once the first attempt is over", () => {
    expect(canReplay(first({}))).toBe(false);
    expect(canReplay(revealed)).toBe(true);
    expect(startReplay(first({}))).toEqual(first({}));
  });

  it("starts with an empty board, fresh hints and a clock at zero", () => {
    const attempt = currentAttempt(startReplay(revealed));
    expect(attempt).toMatchObject({ board: { edges: [], marks: {} }, hintsUsed: 0, emptyHintsUsed: 0, revealedAt: null, solvedAt: null, timeMs: 0 });
  });

  it("a solve after a shown answer counts for nothing: not solved, no streak, help kept", () => {
    const after = replayAndSolve(revealed);
    expect(after).toMatchObject({ solvedAt: null, solvedCells: null, revealedAt: revealed.revealedAt, hintsUsed: 5, checks: 1, timeMs: 90_000 });
    expect(after.replay?.solvedAt).toBe("2026-11-10T11:02:00.000Z");
    const stats = computeStats([after], "2026-11-10");
    expect(stats.streak.current).toBe(0);
    expect(stats.daily.find((d) => d.difficulty === 2)).toMatchObject({ solved: 0, revealed: 1 });
  });

  it("fresh hints never make a solve look unaided, here or on the account", () => {
    const after = replayAndSolve(solvedWithHints);
    expect(solvedUnaided(after)).toBe(false);
    expect(after).toMatchObject({ hintsUsed: 2, timeMs: 90_000, solvedAt: solvedWithHints.solvedAt });
    // What sync sends leaves the replay out, and the account keeps the first attempt.
    expect(toSummary(after).replay).toBeNull();
    expect(mergeSummary(solvedWithHints, toSummary(after))).toMatchObject({ hintsUsed: 2, replay: null });
    // Even an anonymous browser importing it into a new account: still 2 hints.
    expect(mergeSummary(null, toSummary(after))).toMatchObject({ hintsUsed: 2, solvedAt: solvedWithHints.solvedAt });
  });

  it("knows the answer from the record itself, solved or shown", () => {
    expect(knownSolution(solvedWithHints, layout)).toEqual(solution);
    expect(knownSolution(revealed, layout)).toEqual(solution);
    expect(knownSolution(first({}), layout)).toBeNull();
  });
});
