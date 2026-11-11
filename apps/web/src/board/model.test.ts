import { E, N, S, W, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import type { BoardState } from "../storage/progressStore";
import { boardCounts, boardMasks, clueStatus, placePiece, setEdge, setMark, traceRoute } from "./model";

// 3x3, A enters (0,0) from the west, B leaves (2,2) to the south. Hint: (1,1) is a vertical straight.
const layout: PuzzleLayout = {
  width: 3,
  height: 3,
  rowClues: [2, 1, 2],
  colClues: [1, 3, 1],
  endpoints: [
    { row: 0, col: 0, dir: W },
    { row: 2, col: 2, dir: S },
  ],
  hints: [{ row: 1, col: 1, piece: N | S }],
};
const empty: BoardState = { edges: [], marks: {} };

describe("board model", () => {
  it("includes endpoint stubs and hint pieces in the masks", () => {
    const m = boardMasks(layout, empty);
    expect(m[0]![0]).toBe(W);
    expect(m[2]![2]).toBe(S);
    expect(m[1]![1]).toBe(N | S);
    expect(m[0]![1]).toBe(S); // the hint's segment reaches into its neighbour
  });

  it("adds and removes player segments", () => {
    const b = setEdge(layout, empty, "h:0:0", true);
    expect(boardMasks(layout, b)[0]![0]).toBe(W | E);
    expect(setEdge(layout, b, "h:0:0", false).edges).toEqual([]);
  });

  it("never gives a cell a third segment", () => {
    const b = setEdge(layout, empty, "h:0:0", true); // (0,0) now W|E
    expect(setEdge(layout, b, "v:0:0", true)).toBe(b);
  });

  it("cannot remove a segment fixed by a hint", () => {
    expect(setEdge(layout, empty, "v:0:1", false)).toBe(empty);
  });

  it("clears a 'no track' mark when track is laid through it", () => {
    const marked = setMark(layout, empty, { row: 0, col: 1 }, "empty");
    // (0,1) already has a hint segment, so the mark is refused
    expect(marked).toBe(empty);
    const b = setMark(layout, empty, { row: 1, col: 0 }, "empty");
    expect(b.marks["1:0"]).toBe("empty");
    expect(setEdge(layout, b, "v:0:0", true).marks["1:0"]).toBeUndefined();
  });

  it("counts track squares and 'track here' marks", () => {
    const b = setMark(layout, empty, { row: 1, col: 2 }, "track");
    const counts = boardCounts(layout, b);
    // A (0,0), hint neighbour (0,1), hint (1,1), (2,1) via hint, B (2,2), marked (1,2)
    expect(counts.rows).toEqual([2, 2, 2]);
    expect(counts.cols).toEqual([1, 3, 2]);
  });

  it("places a whole hinted piece, and skips sides that leave the grid", () => {
    const b = placePiece(layout, empty, { row: 0, col: 0 }, W | E); // A's square: W is the stub
    expect(b.edges).toEqual(["h:0:0"]);
    expect(boardMasks(layout, b)[0]![0]).toBe(W | E);
  });

  it("classifies clue progress", () => {
    expect(clueStatus(1, 2)).toBe("under");
    expect(clueStatus(2, 2)).toBe("done");
    expect(clueStatus(3, 2)).toBe("over");
  });
});

describe("traceRoute", () => {
  const solution = [
    [W | E, W | S, 0],
    [0, N | S, 0],
    [0, N | E, W | S],
  ];

  it("follows the track from A to B in order", () => {
    const route = traceRoute(layout, solution);
    expect(route?.map((s) => [s.cell.row, s.cell.col, s.from, s.to])).toEqual([
      [0, 0, W, E],
      [0, 1, W, S],
      [1, 1, N, S],
      [2, 1, N, E],
      [2, 2, W, S],
    ]);
  });

  it("returns null for a broken track", () => {
    const broken = solution.map((row) => [...row]);
    broken[1]![1] = 0;
    expect(traceRoute(layout, broken)).toBeNull();
  });
});

/*
 * 3x3 with one crossing at (1,1). A enters (1,0) from the west, the track
 * runs east over (1,1), up, back west, and down over (1,1) to B below (2,1).
 *
 *   .  ┌─┐
 *   A ─┼─┘
 *   .  │ .
 *      B
 */
const crossLayout: PuzzleLayout = {
  width: 3,
  height: 3,
  rowClues: [2, 3, 1],
  colClues: [1, 3, 2],
  endpoints: [
    { row: 1, col: 0, dir: W },
    { row: 2, col: 1, dir: S },
  ],
  hints: [],
  crossings: 1,
};
const crossSolution = [
  [0, E | S, S | W],
  [W | E, N | E | S | W, W | N],
  [0, N | S, 0],
];

describe("board model with crossings", () => {
  const drawn = (edges: string[]) => edges.reduce((b, e) => setEdge(crossLayout, b, e, true), empty);

  it("never lets players build a crossing when the crossings are given", () => {
    const bridged = { ...crossLayout, hints: [{ row: 1, col: 1, piece: N | E | S | W }] };
    expect(boardMasks(bridged, empty)[1]![1]).toBe(N | E | S | W);
    // (0,1) already holds its E-S curve; a third segment is refused.
    const curve = ["h:0:1", "v:0:1"].reduce((b, e) => setEdge(bridged, b, e, true), empty);
    expect(setEdge(bridged, curve, "h:0:0", true)).toBe(curve);
    const plain = { ...crossLayout, crossings: undefined };
    const two = ["h:1:0", "h:1:1", "v:0:1"].reduce((b, e) => setEdge(plain, b, e, true), empty);
    expect(boardMasks(plain, two)[1]![1]).toBe(E | W);
  });

  it("still lets players cross on older puzzles whose crossing isn't given", () => {
    const four = drawn(["h:1:0", "h:1:1", "v:0:1", "v:1:1"]);
    expect(boardMasks(crossLayout, four)[1]![1]).toBe(N | E | S | W);
  });

  it("never lets A or B's square cross", () => {
    // A's square already has its stub; one more segment makes two.
    const b = drawn(["h:1:0", "v:0:0", "v:1:0"]);
    expect(b.edges).toEqual(["h:1:0"]);
  });

  it("drives straight over a crossing, passing it twice", () => {
    const route = traceRoute(crossLayout, crossSolution)!;
    expect(route).toHaveLength(7);
    const over = route.filter((s) => s.cell.row === 1 && s.cell.col === 1);
    expect(over.map((s) => [s.from, s.to])).toEqual([
      [W, E],
      [N, S],
    ]);
  });
});
