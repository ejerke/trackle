import { edgesFromMasks, type HintResponse, type PuzzleLayout } from "@trackle/shared";
import { deductionOrder } from "./logic.ts";

/**
 * SERVER ONLY. The most useful hint for the player's current board (ADR 0014):
 *
 *  1. a mistake, if there is one: a segment that isn't in the solution, or a
 *     square marked "no track" that has track. Fixing errors first is what
 *     actually unsticks people;
 *  2. otherwise the next piece logic would work out (deductionOrder) that the
 *     player doesn't have yet, so the hint feels like a natural next step;
 *  3. otherwise "complete": the board is the solution, press Check.
 *
 * Each hint reveals at most one segment or one square.
 */
export function computeHint(
  layout: PuzzleLayout,
  solution: number[][],
  cells: number[][],
  emptyCells: readonly [number, number][] = [],
): HintResponse {
  const { width, height } = layout;
  const at = (grid: number[][], r: number, c: number) => grid[r]?.[c] ?? 0;

  const correct = new Set(edgesFromMasks(width, height, solution));
  const wrongEdge = edgesFromMasks(width, height, cells).find((e) => !correct.has(e));
  if (wrongEdge) return { kind: "mistake", edge: wrongEdge, cell: null };

  const wrongMark = emptyCells.find(([r, c]) => at(solution, r, c) !== 0);
  if (wrongMark) return { kind: "mistake", edge: null, cell: { row: wrongMark[0], col: wrongMark[1] } };

  const missing = (r: number, c: number) => at(solution, r, c) !== 0 && at(cells, r, c) !== at(solution, r, c);
  const next = deductionOrder(layout).find(({ row, col }) => missing(row, col));
  if (next) return { kind: "piece", ...next, piece: at(solution, next.row, next.col) };

  // Logic didn't reach it (not expected for generated puzzles): any missing piece.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (missing(r, c)) return { kind: "piece", row: r, col: c, piece: at(solution, r, c) };
    }
  }
  return { kind: "complete" };
}
