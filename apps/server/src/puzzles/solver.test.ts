import { E, N, S, W, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { solve } from "./solver.ts";

// 2x2, A enters (0,0) from the west, B leaves (0,1) to the east, all four cells
// are track: the only way is a U-turn down and back up.
const uTurn: PuzzleLayout = {
  width: 2,
  height: 2,
  rowClues: [2, 2],
  colClues: [2, 2],
  endpoints: [
    { row: 0, col: 0, dir: W },
    { row: 0, col: 1, dir: E },
  ],
  hints: [],
};

// 4x4 with exactly two solutions when no hints are given (found by searching
// generated puzzles). The hint at (2,1) picks one of them.
const twoSolutions: PuzzleLayout = {
  width: 4,
  height: 4,
  rowClues: [0, 4, 4, 3],
  colClues: [3, 3, 3, 2],
  endpoints: [
    { row: 2, col: 3, dir: E },
    { row: 3, col: 2, dir: S },
  ],
  hints: [],
};
const hint = { row: 2, col: 1, piece: E | S };
const intended = [
  [0, 0, 0, 0],
  [E | S, W | E, W | E, W | S],
  [N | S, E | S, W | S, N | E],
  [N | E, N | W, N | S, 0],
];

describe("solve", () => {
  it("finds a unique solution", () => {
    const result = solve(uTurn);
    expect(result.count).toBe(1);
    expect(result.solutions[0]).toEqual([
      [W | S, S | E],
      [N | E, N | W],
    ]);
  });

  it("reports zero solutions for impossible clues", () => {
    expect(solve({ ...uTurn, rowClues: [2, 1], colClues: [2, 1] }).count).toBe(0);
    expect(solve({ ...uTurn, colClues: [1, 1] }).count).toBe(0); // row and column sums differ
  });

  it("finds every solution of an ambiguous puzzle", () => {
    const result = solve(twoSolutions, 10);
    expect(result.count).toBe(2);
    expect(result.solutions).toContainEqual(intended);
  });

  it("stops counting at the limit", () => {
    const result = solve(twoSolutions, 1);
    expect(result.count).toBe(1);
    expect(result.solutions).toHaveLength(1);
  });

  it("uses hints to rule out solutions", () => {
    const result = solve({ ...twoSolutions, hints: [hint] }, 10);
    expect(result.count).toBe(1);
    expect(result.solutions[0]).toEqual(intended);
  });

  it("finds no solution when a hint contradicts the clues", () => {
    expect(solve({ ...twoSolutions, hints: [{ row: 0, col: 0, piece: E | S }] }).count).toBe(0);
  });

  it("supports endpoints on any side, including N and S", () => {
    // 1x3 column: A enters the top from the north, B leaves the bottom to the south.
    const column: PuzzleLayout = {
      width: 1,
      height: 3,
      rowClues: [1, 1, 1],
      colClues: [3],
      endpoints: [
        { row: 0, col: 0, dir: N },
        { row: 2, col: 0, dir: S },
      ],
      hints: [],
    };
    expect(solve(column).solutions[0]).toEqual([[N | S], [N | S], [N | S]]);
  });
});
