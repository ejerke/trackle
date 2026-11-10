import { E, N, S, W, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import type { BoardState } from "../storage/progressStore";
import { boardCounts, boardMasks, clueStatus, placePiece, setEdge, setMark } from "./model";

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
