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
  it("fixes a wrong segment first: the piece there, with the wrong segments to delete", () => {
    const cells = blank();
    cells[0]![0] = W | S; // goes down instead of right
    cells[1]![0] = N;
    expect(computeHint(layout, solution, cells)).toEqual({ kind: "piece", row: 0, col: 0, piece: W | E, remove: ["v:0:0"] });
  });

  it("removes wrong segments at the squares the piece connects to", () => {
    // The player runs straight on at (0,1) instead of turning down.
    const cells = blank();
    cells[0]![0] = W | E;
    cells[0]![1] = W | E; // wrong: should turn down
    cells[0]![2] = W;
    const hint = computeHint(layout, solution, cells);
    expect(hint).toEqual({ kind: "piece", row: 0, col: 1, piece: W | S, remove: ["h:0:1"] });
  });

  it("fixes a 'no track' mark on a square that has track", () => {
    expect(computeHint(layout, solution, blank(), [[1, 1]])).toMatchObject({ kind: "piece", row: 1, col: 1, piece: N | E });
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
});

describe("computeHint: no track", () => {
  const emptySquares = ["0:2", "1:0", "2:0", "2:1"];

  it("first reveals a square the player drew track through", () => {
    const cells = blank();
    cells[1]![0] = E;
    cells[1]![1] = W;
    expect(computeHint(layout, solution, cells, [], "empty")).toEqual({ kind: "empty", row: 1, col: 0 });
  });

  it("otherwise a square without track that isn't marked yet", () => {
    const hint = computeHint(layout, solution, blank(), [[0, 2]], "empty");
    expect(hint.kind).toBe("empty");
    if (hint.kind === "empty") {
      expect(emptySquares).toContain(`${hint.row}:${hint.col}`);
      expect([hint.row, hint.col]).not.toEqual([0, 2]);
    }
  });

  it("picks a useful square on generated puzzles: never one the clues already give away", () => {
    for (const seed of ["e1", "e2", "e3", "e4", "e5", "e6"]) {
      const g = generatePuzzle({ difficulty: 2, seed });
      const { layout: l, solution: sol } = g;
      const cells = emptyGrid(l.width, l.height);
      for (const ep of l.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
      for (const h of l.hints) cells[h.row]![h.col] = h.piece;
      const hint = computeHint(l, sol, cells, [], "empty");
      expect(hint.kind).toBe("empty");
      if (hint.kind !== "empty") continue;
      expect(sol[hint.row]![hint.col]).toBe(0);
      expect(l.rowClues[hint.row]).toBeGreaterThan(0);
      expect(l.colClues[hint.col]).toBeGreaterThan(0);
      // Beside the track, where it constrains the route.
      const beside = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => (sol[hint.row + dr!]?.[hint.col + dc!] ?? 0) !== 0);
      expect(beside).toBe(true);
    }
  });

  it("prefers the open sides of a loose end the player left", () => {
    const g = generatePuzzle({ difficulty: 2, seed: "loose" });
    const { layout: l, solution: sol } = g;
    const cells = emptyGrid(l.width, l.height);
    for (const ep of l.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
    for (const h of l.hints) cells[h.row]![h.col] = h.piece;
    const hint = computeHint(l, sol, cells, [], "empty");
    if (hint.kind !== "empty") throw new Error("expected an empty hint");
    // Some square with a single segment (a loose end) is right next to it.
    const loose = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
      const m = cells[hint.row + dr!]?.[hint.col + dc!] ?? 0;
      return m !== 0 && (m & (m - 1)) === 0;
    });
    expect(loose).toBe(true);
  });

  it("says 'complete' once every square without track is marked", () => {
    const marks = emptySquares.map((k) => k.split(":").map(Number) as [number, number]);
    expect(computeHint(layout, solution, blank(), marks, "empty")).toEqual({ kind: "complete" });
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
