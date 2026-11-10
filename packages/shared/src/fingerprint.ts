import type { PuzzleLayout } from "./types.ts";

/**
 * A short, stable id for a puzzle's *content* (size, clues, endpoints, hints).
 * Saved progress remembers it, so a board drawn for one version of a puzzle is
 * never shown on a different puzzle that ended up under the same date or seed
 * (e.g. after a generator change or a database restore).
 *
 * Not a security feature: FNV-1a, 32 bits, just enough to tell puzzles apart.
 */
export function puzzleFingerprint(layout: PuzzleLayout): string {
  const canonical = JSON.stringify([
    layout.width,
    layout.height,
    layout.rowClues,
    layout.colClues,
    layout.endpoints.map((e) => [e.row, e.col, e.dir]),
    [...layout.hints].sort((a, b) => a.row - b.row || a.col - b.col).map((h) => [h.row, h.col, h.piece]),
  ]);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
