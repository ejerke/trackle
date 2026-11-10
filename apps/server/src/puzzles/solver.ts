import { DELTA, DIRS, emptyGrid, opposite, type Dir, type PuzzleLayout } from "@trackle/shared";

/**
 * SERVER ONLY. Counts the solutions of a puzzle (up to `limit`) by depth-first
 * search: walk from A one cell at a time, never revisiting a cell, until B.
 *
 * Pruning:
 *  - a row/column can't take more track than its clue,
 *  - B must still be reachable within the remaining track budget,
 *  - hint cells force both the entry and the exit direction.
 *
 * Fast for the 6x6 daily grid; very large grids would need a smarter solver.
 */
export interface SolveResult {
  /** Number of solutions found, capped at `limit`. */
  count: number;
  /** Mask grids of the solutions found (at most `limit`). */
  solutions: number[][][];
}

export function solve(layout: PuzzleLayout, limit = 2): SolveResult {
  const { width, height, rowClues, colClues, endpoints, hints } = layout;
  const [a, b] = endpoints;
  const result: SolveResult = { count: 0, solutions: [] };

  let budget = rowClues.reduce((s, n) => s + n, 0);
  if (budget !== colClues.reduce((s, n) => s + n, 0)) return result;

  const rowLeft = Int32Array.from(rowClues);
  const colLeft = Int32Array.from(colClues);
  const hintAt = new Uint8Array(width * height);
  for (const h of hints) hintAt[h.row * width + h.col] = h.piece;
  let hintsLeft = hints.length;

  /** Current partial track; non-zero also means "visited". */
  const mask = new Uint8Array(width * height);
  const bIndex = b.row * width + b.col;

  const record = () => {
    const grid = emptyGrid(width, height);
    for (let i = 0; i < mask.length; i++) grid[Math.floor(i / width)]![i % width] = mask[i]!;
    result.solutions.push(grid);
  };

  /** Enter cell (row, col) through its `inDir` side. */
  const enter = (row: number, col: number, inDir: Dir): void => {
    if (result.count >= limit) return;
    if (row < 0 || row >= height || col < 0 || col >= width) return;
    const i = row * width + col;
    if (mask[i] || rowLeft[row] === 0 || colLeft[col] === 0) return;
    const hint = hintAt[i]!;
    if (hint && !(hint & inDir)) return;

    rowLeft[row]!--;
    colLeft[col]!--;
    budget--;
    if (hint) hintsLeft--;

    if (i === bIndex) {
      // Reaching B ends the track: its piece is fixed as entry + outward exit.
      const piece = inDir | b.dir;
      if (budget === 0 && hintsLeft === 0 && (!hint || hint === piece)) {
        // budget 0 implies every row and column count is exactly met.
        mask[i] = piece;
        result.count++;
        if (result.solutions.length < limit) record();
        mask[i] = 0;
      }
    } else if (Math.abs(row - b.row) + Math.abs(col - b.col) <= budget) {
      for (const out of DIRS) {
        if (out === inDir || (hint && !(hint & out))) continue;
        const [dr, dc] = DELTA[out];
        mask[i] = inDir | out;
        enter(row + dr, col + dc, opposite(out));
      }
      mask[i] = 0;
    }

    rowLeft[row]!++;
    colLeft[col]!++;
    budget++;
    if (hint) hintsLeft++;
  };

  // A's cell is entered "from outside", through its outward side.
  enter(a.row, a.col, a.dir);
  return result;
}
