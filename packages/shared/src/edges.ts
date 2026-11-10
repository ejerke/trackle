import { DIRS, DELTA, E, N, S, W, emptyGrid, inBounds } from "./grid.ts";
import type { PuzzleLayout } from "./types.ts";

/**
 * An edge between two adjacent cells, as a string key:
 *   "h:r:c"  between (r, c) and (r, c+1)   (a horizontal track segment)
 *   "v:r:c"  between (r, c) and (r+1, c)   (a vertical track segment)
 * Strings make edges easy to keep in Sets and to serialise.
 */
export type EdgeKey = string;

export interface Cell {
  row: number;
  col: number;
}

/** The edge between two orthogonally adjacent cells, or null if they aren't adjacent. */
export function edgeBetween(a: Cell, b: Cell): EdgeKey | null {
  if (a.row === b.row && Math.abs(a.col - b.col) === 1) {
    return `h:${a.row}:${Math.min(a.col, b.col)}`;
  }
  if (a.col === b.col && Math.abs(a.row - b.row) === 1) {
    return `v:${Math.min(a.row, b.row)}:${a.col}`;
  }
  return null;
}

/** The two cells an edge joins: the first is always the top/left one. */
export function edgeCells(key: EdgeKey): [Cell, Cell] {
  const [kind, r, c] = key.split(":");
  const row = Number(r);
  const col = Number(c);
  return kind === "h"
    ? [{ row, col }, { row, col: col + 1 }]
    : [{ row, col }, { row: row + 1, col }];
}

export function isValidEdge(width: number, height: number, key: EdgeKey): boolean {
  const m = /^([hv]):(\d+):(\d+)$/.exec(key);
  if (!m) return false;
  const [a, b] = edgeCells(key);
  return inBounds(width, height, a.row, a.col) && inBounds(width, height, b.row, b.col);
}

/**
 * Convert a set of edges into a mask grid. Endpoint outward bits are always
 * included, because the A/B stubs are part of every track.
 */
export function masksFromEdges(layout: PuzzleLayout, edges: Iterable<EdgeKey>): number[][] {
  const cells = emptyGrid(layout.width, layout.height);
  for (const key of edges) {
    if (!isValidEdge(layout.width, layout.height, key)) continue;
    const [a, b] = edgeCells(key);
    if (key.startsWith("h")) {
      cells[a.row][a.col] |= E;
      cells[b.row][b.col] |= W;
    } else {
      cells[a.row][a.col] |= S;
      cells[b.row][b.col] |= N;
    }
  }
  for (const ep of layout.endpoints) cells[ep.row][ep.col] |= ep.dir;
  return cells;
}

/** Interior edges implied by a mask grid (bits pointing out of the grid are ignored). */
export function edgesFromMasks(width: number, height: number, cells: number[][]): EdgeKey[] {
  const edges: EdgeKey[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const m = cells[r]?.[c] ?? 0;
      if (m & E && c + 1 < width) edges.push(`h:${r}:${c}`);
      if (m & S && r + 1 < height) edges.push(`v:${r}:${c}`);
    }
  }
  return edges;
}

/** Edges fixed by hint pieces. The player can't remove these. */
export function fixedEdges(layout: PuzzleLayout): Set<EdgeKey> {
  const result = new Set<EdgeKey>();
  for (const hint of layout.hints) {
    for (const d of DIRS) {
      if (!(hint.piece & d)) continue;
      const [dr, dc] = DELTA[d];
      const edge = edgeBetween(hint, { row: hint.row + dr, col: hint.col + dc });
      if (edge && isValidEdge(layout.width, layout.height, edge)) result.add(edge);
    }
  }
  return result;
}

