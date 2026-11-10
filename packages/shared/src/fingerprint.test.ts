import { describe, expect, it } from "vitest";
import { puzzleFingerprint } from "./fingerprint.ts";
import { E, N, S, W } from "./grid.ts";
import type { PuzzleLayout } from "./types.ts";

const layout: PuzzleLayout = {
  width: 3,
  height: 3,
  rowClues: [2, 2, 1],
  colClues: [1, 2, 2],
  endpoints: [
    { row: 0, col: 0, dir: W },
    { row: 2, col: 2, dir: S },
  ],
  hints: [
    { row: 1, col: 1, piece: N | E },
    { row: 0, col: 1, piece: W | S },
  ],
};

describe("puzzleFingerprint", () => {
  it("is stable and ignores the order hints are listed in", () => {
    expect(puzzleFingerprint(layout)).toMatch(/^[0-9a-f]{8}$/);
    expect(puzzleFingerprint({ ...layout, hints: [...layout.hints].reverse() })).toBe(puzzleFingerprint(layout));
  });

  it("changes when anything about the puzzle changes", () => {
    const base = puzzleFingerprint(layout);
    expect(puzzleFingerprint({ ...layout, rowClues: [2, 1, 2] })).not.toBe(base);
    expect(puzzleFingerprint({ ...layout, hints: layout.hints.slice(1) })).not.toBe(base);
    expect(puzzleFingerprint({ ...layout, endpoints: [layout.endpoints[0], { row: 2, col: 2, dir: E }] })).not.toBe(base);
  });
});
