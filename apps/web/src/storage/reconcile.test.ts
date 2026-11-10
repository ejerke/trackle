import { E, N, S, W, puzzleFingerprint, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { emptyProgress, type PuzzleKey, type PuzzleProgress } from "./progressStore";
import { reconcileProgress } from "./reconcile";

// 3x3: A enters (0,0) from the west, B leaves (2,2) south. Hint at (1,1): N|E.
const layout: PuzzleLayout = {
  width: 3,
  height: 3,
  rowClues: [2, 2, 1],
  colClues: [1, 2, 2],
  endpoints: [
    { row: 0, col: 0, dir: W },
    { row: 2, col: 2, dir: S },
  ],
  hints: [{ row: 1, col: 1, piece: N | E }],
};
const solution = [
  [W | E, W | S, 0],
  [0, N | E, W | S],
  [0, 0, N | S],
];
const key: PuzzleKey = { kind: "daily", date: "2026-11-10", difficulty: 1 };
const fp = puzzleFingerprint(layout);

/** A record saved before fingerprints existed. */
const legacy = (edges: string[], solvedCells: number[][] | null = null): PuzzleProgress => ({
  ...emptyProgress(key, null),
  board: { edges, marks: {} },
  solvedAt: solvedCells ? "2026-11-10T09:00:00.000Z" : null,
  solvedCells,
});

describe("reconcileProgress", () => {
  it("starts fresh, tagged with the puzzle, when nothing is saved", () => {
    const r = reconcileProgress(null, key, layout);
    expect(r.action).toBe("new");
    expect(r.progress.puzzleFingerprint).toBe(fp);
  });

  it("keeps progress saved for this exact puzzle", () => {
    const saved = { ...emptyProgress(key, fp), board: { edges: ["h:0:0"], marks: {} } };
    expect(reconcileProgress(saved, key, layout)).toEqual({ progress: saved, action: "keep" });
  });

  it("discards progress saved for a different puzzle under the same key", () => {
    const other = { ...emptyProgress(key, "deadbeef"), board: { edges: ["h:0:0"], marks: {} } };
    const r = reconcileProgress(other, key, layout);
    expect(r.action).toBe("discard");
    expect(r.progress.board.edges).toEqual([]);
  });

  it("discards old unsolved boards: they can't be proven to belong to this puzzle", () => {
    // Even a board that would fit this grid may have been drawn on another puzzle.
    expect(reconcileProgress(legacy(["h:0:0", "v:1:2"]), key, layout).action).toBe("discard");
  });

  it("keeps an old solve only if its answer still solves this puzzle", () => {
    const kept = reconcileProgress(legacy([], solution), key, layout);
    expect(kept.action).toBe("adopt");
    expect(kept.progress.puzzleFingerprint).toBe(fp);
    const wrong = solution.map((row) => [...row]);
    wrong[2]![2] = N | E;
    expect(reconcileProgress(legacy([], wrong), key, layout).action).toBe("discard");
  });
});
