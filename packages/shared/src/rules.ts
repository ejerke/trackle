import { CROSSING, DELTA, DIRS, bitCount, inBounds, opposite, type Dir } from "./grid.ts";
import type { PuzzleLayout } from "./types.ts";

export interface LineCounts {
  rows: number[];
  cols: number[];
}

/** Count cells per row and column for which `isTrack(row, col)` is true. */
export function lineCounts(
  width: number,
  height: number,
  isTrack: (row: number, col: number) => boolean,
): LineCounts {
  const rows = new Array<number>(height).fill(0);
  const cols = new Array<number>(width).fill(0);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (isTrack(r, c)) {
        rows[r]++;
        cols[c]++;
      }
    }
  }
  return { rows, cols };
}

export type TrackError =
  | "wrong_size"
  | "invalid_cell"
  | "dangling"
  | "leaves_grid"
  | "missing_endpoint"
  | "hint_mismatch"
  | "clue_mismatch"
  | "crossing_mismatch"
  | "not_connected";

export type TrackValidation = { ok: true } | { ok: false; error: TrackError };

/**
 * Does this mask grid satisfy every rule of the puzzle?
 *
 * Because puzzles have a unique solution, a valid track *is* the solution, so
 * this needs no secret and is safe to ship to the browser (see ADR 0004).
 */
export function validateTrack(layout: PuzzleLayout, cells: number[][]): TrackValidation {
  const { width, height } = layout;
  const fail = (error: TrackError): TrackValidation => ({ ok: false, error });

  if (cells.length !== height || cells.some((row) => row.length !== width)) return fail("wrong_size");
  const at = (r: number, c: number): number => cells[r][c];

  const isEndpoint = (r: number, c: number, d: Dir): boolean =>
    layout.endpoints.some((ep) => ep.row === r && ep.col === c && ep.dir === d);

  const isEndpointCell = (r: number, c: number): boolean => layout.endpoints.some((ep) => ep.row === r && ep.col === c);

  let trackCells = 0;
  let crossings = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const m = at(r, c);
      if (!Number.isInteger(m) || m < 0 || m > 15) return fail("invalid_cell");
      if (m === 0) continue;
      if (m === CROSSING && !isEndpointCell(r, c)) crossings++;
      else if (bitCount(m) !== 2) return fail("invalid_cell");
      trackCells++;
      for (const d of DIRS) {
        if (!(m & d)) continue;
        const [dr, dc] = DELTA[d];
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(width, height, nr, nc)) {
          if (!isEndpoint(r, c, d)) return fail("leaves_grid");
        } else if (!(at(nr, nc) & opposite(d))) {
          return fail("dangling");
        }
      }
    }
  }

  for (const ep of layout.endpoints) {
    if (!(at(ep.row, ep.col) & ep.dir)) return fail("missing_endpoint");
  }
  for (const hint of layout.hints) {
    if (at(hint.row, hint.col) !== hint.piece) return fail("hint_mismatch");
  }

  const counts = lineCounts(width, height, (r, c) => at(r, c) !== 0);
  const sameAs = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (!sameAs(counts.rows, layout.rowClues) || !sameAs(counts.cols, layout.colClues)) {
    return fail("clue_mismatch");
  }
  if (crossings !== (layout.crossings ?? 0)) return fail("crossing_mismatch");

  // Walk from A, straight on over crossings. Each pass through a square is
  // used at most once and the only exits are A and B, so the walk must end at
  // B; it is a single track iff it makes every pass: one per square, two per
  // crossing.
  const passes = trackCells + crossings;
  const [a, b] = layout.endpoints;
  let row = a.row;
  let col = a.col;
  let cameFrom: Dir = a.dir;
  let visited = 0;
  for (;;) {
    visited++;
    const m = at(row, col);
    const out = (m === CROSSING ? opposite(cameFrom) : m & ~cameFrom) as Dir;
    if (row === b.row && col === b.col && out === b.dir) break;
    const [dr, dc] = DELTA[out];
    row += dr;
    col += dc;
    cameFrom = opposite(out);
    if (!inBounds(width, height, row, col) || visited > passes) return fail("not_connected");
  }
  return visited === passes ? { ok: true } : fail("not_connected");
}
