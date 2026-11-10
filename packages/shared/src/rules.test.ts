import { describe, expect, it } from "vitest";
import { E, N, S, W } from "./grid.ts";
import { validateTrack } from "./rules.ts";
import type { PuzzleLayout } from "./types.ts";

/*
 * 3x3 puzzle used throughout. A enters (0,0) from the west, B leaves (2,2) south.
 *
 *   A ─┐ .
 *   .  └─┐
 *   .  . │ B
 */
const layout: PuzzleLayout = {
  width: 3,
  height: 3,
  rowClues: [2, 2, 1],
  colClues: [1, 2, 2],
  endpoints: [
    { row: 0, col: 0, dir: W },
    { row: 2, col: 2, dir: S },
  ],
  hints: [],
};
const solution = [
  [W | E, W | S, 0],
  [0, N | E, W | S],
  [0, 0, N | S],
];
const clone = (g: number[][]) => g.map((row) => [...row]);

describe("validateTrack", () => {
  it("accepts the solution", () => {
    expect(validateTrack(layout, solution)).toEqual({ ok: true });
  });

  it("rejects a grid of the wrong size", () => {
    expect(validateTrack(layout, solution.slice(0, 2))).toEqual({ ok: false, error: "wrong_size" });
  });

  it("rejects cells that aren't a single piece", () => {
    const g = clone(solution);
    g[0]![0] = W | E | S;
    expect(validateTrack(layout, g)).toEqual({ ok: false, error: "invalid_cell" });
  });

  it("rejects a segment with no matching neighbour", () => {
    const g = clone(solution);
    g[2]![0] = N | E; // points north into an empty cell
    expect(validateTrack(layout, g)).toEqual({ ok: false, error: "dangling" });
  });

  it("rejects track leaving the grid anywhere but A or B", () => {
    const g = clone(solution);
    g[2]![2] = N | E;
    expect(validateTrack(layout, g)).toEqual({ ok: false, error: "leaves_grid" });
  });

  it("rejects a track that misses an endpoint", () => {
    const empty = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    expect(validateTrack(layout, empty)).toEqual({ ok: false, error: "missing_endpoint" });
  });

  it("rejects a track that contradicts a hint", () => {
    const withHint = { ...layout, hints: [{ row: 1, col: 1, piece: N | S }] };
    expect(validateTrack(withHint, solution)).toEqual({ ok: false, error: "hint_mismatch" });
  });

  it("rejects a valid path that doesn't match the clues", () => {
    expect(validateTrack({ ...layout, rowClues: [2, 1, 2] }, solution)).toEqual({
      ok: false,
      error: "clue_mismatch",
    });
  });

  it("rejects a separate loop next to the A-B track", () => {
    // 4x4: A-B along the top row, plus a closed 2x2 loop below.
    const loopLayout: PuzzleLayout = {
      width: 4,
      height: 4,
      rowClues: [4, 0, 2, 2],
      colClues: [3, 3, 1, 1],
      endpoints: [
        { row: 0, col: 0, dir: W },
        { row: 0, col: 3, dir: E },
      ],
      hints: [],
    };
    const g = [
      [W | E, W | E, W | E, W | E],
      [0, 0, 0, 0],
      [E | S, W | S, 0, 0],
      [N | E, N | W, 0, 0],
    ];
    expect(validateTrack(loopLayout, g)).toEqual({ ok: false, error: "not_connected" });
  });
});
