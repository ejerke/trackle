/**
 * Directions as bit flags. A cell's track is the OR of the directions it
 * leaves through, e.g. N|S is a vertical straight, E|S a curve (┌).
 */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type Dir = typeof N | typeof E | typeof S | typeof W;

export const DIRS: readonly Dir[] = [N, E, S, W];

/** Row/column offset for each direction. */
export const DELTA: Readonly<Record<Dir, readonly [number, number]>> = {
  [N]: [-1, 0],
  [E]: [0, 1],
  [S]: [1, 0],
  [W]: [0, -1],
};

export function opposite(d: Dir): Dir {
  // N(1) <-> S(4), E(2) <-> W(8): rotate the 4-bit value by two places.
  return (((d << 2) | (d >> 2)) & 15) as Dir;
}

export function bitCount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/** True for the six valid pieces: two straights and four curves. */
export function isPiece(mask: number): boolean {
  return mask >= 0 && mask <= 15 && bitCount(mask) === 2;
}

export function inBounds(width: number, height: number, row: number, col: number): boolean {
  return row >= 0 && row < height && col >= 0 && col < width;
}

/** A height x width grid of zeros. */
export function emptyGrid(width: number, height: number): number[][] {
  return Array.from({ length: height }, () => new Array<number>(width).fill(0));
}
