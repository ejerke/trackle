import { E, N, S, W, emptyGrid, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { generatePuzzle } from "./generator.ts";
import { computeHint } from "./hints.ts";
import { deductionOrder } from "./logic.ts";

/*
 * 3x3: A enters (0,0) from the west, B leaves (2,2) south.
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
/** What the client sends for an empty board: just the A/B stubs. */
const blank = () => {
  const g = emptyGrid(3, 3);
  g[0]![0] = W;
  g[2]![2] = S;
  return g;
};

describe("computeHint", () => {
  it("points out a wrong segment before anything else", () => {
    const cells = blank();
    cells[0]![0] = W | S; // goes down instead of right
    cells[1]![0] = N;
    expect(computeHint(layout, solution, cells)).toEqual({ kind: "mistake", edge: "v:0:0", cell: null });
  });

  it("points out a 'no track' mark on a square that has track", () => {
    expect(computeHint(layout, solution, blank(), [[1, 1]])).toEqual({ kind: "mistake", edge: null, cell: { row: 1, col: 1 } });
    // Correct marks are fine.
    expect(computeHint(layout, solution, blank(), [[2, 0]]).kind).toBe("piece");
  });

  it("otherwise reveals the next piece the player doesn't have yet, in logical order", () => {
    const first = computeHint(layout, solution, blank());
    expect(first.kind).toBe("piece");
    if (first.kind !== "piece") return;
    expect(first.piece).toBe(solution[first.row]![first.col]);

    // Place that piece; the next hint moves on to a different square.
    const cells = solution.map((row, r) => row.map((m, c) => (r === first.row && c === first.col ? m : blank()[r]![c]!)));
    const second = computeHint(layout, solution, cells);
    expect(second.kind).toBe("piece");
    if (second.kind === "piece") expect([second.row, second.col]).not.toEqual([first.row, first.col]);
  });

  it("says 'complete' when the board is already the solution", () => {
    expect(computeHint(layout, solution, solution)).toEqual({ kind: "complete" });
  });

  it("always gives a correct piece on generated puzzles", () => {
    for (const seed of ["h1", "h2", "h3"]) {
      const g = generatePuzzle({ difficulty: 1, seed });
      const cells = emptyGrid(g.layout.width, g.layout.height);
      for (const ep of g.layout.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
      for (const h of g.layout.hints) cells[h.row]![h.col] = h.piece;
      const hint = computeHint(g.layout, g.solution, cells);
      expect(hint.kind).toBe("piece");
      if (hint.kind === "piece") expect(hint.piece).toBe(g.solution[hint.row]![hint.col]);
    }
  });
});

describe("deductionOrder", () => {
  it("lists every non-given track square exactly once", () => {
    const g = generatePuzzle({ difficulty: 1, seed: "order" });
    const order = deductionOrder(g.layout);
    const keys = order.map(({ row, col }) => `${row}:${col}`);
    expect(new Set(keys).size).toBe(keys.length);
    const given = new Set(g.layout.hints.map((h) => `${h.row}:${h.col}`));
    const track = g.solution.flatMap((row, r) => row.map((m, c) => (m ? `${r}:${c}` : null))).filter((k): k is string => k !== null);
    expect(new Set(keys)).toEqual(new Set(track.filter((k) => !given.has(k))));
  });
});
