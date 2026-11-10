import { puzzleFingerprint, validateTrack, type PuzzleLayout } from "@trackle/shared";
import { emptyProgress, type PuzzleKey, type PuzzleProgress } from "./progressStore";

export type Reconciled =
  /** Saved progress belongs to this puzzle (possibly just tagged with its fingerprint). */
  | { progress: PuzzleProgress; action: "keep" | "adopt" }
  /** Saved progress was for a different puzzle: start fresh and remove it. */
  | { progress: PuzzleProgress; action: "discard" }
  | { progress: PuzzleProgress; action: "new" };

/**
 * Decide what saved progress (if any) to show for the puzzle on screen.
 *
 *  - same fingerprint: keep it;
 *  - no fingerprint (saved before schema v3): keep it only if it's solved and
 *    the saved answer still solves this puzzle, then tag it. An unsolved old
 *    board can't be told apart from one drawn on another puzzle (a random
 *    scribble usually "fits" a mostly empty grid), so it is discarded. Only
 *    pre-release development browsers have such records;
 *  - anything else was drawn on a different puzzle under the same key (a
 *    regenerated puzzle, a restored database): discard it.
 */
export function reconcileProgress(stored: PuzzleProgress | null, key: PuzzleKey, layout: PuzzleLayout): Reconciled {
  const fingerprint = puzzleFingerprint(layout);
  if (!stored) return { progress: emptyProgress(key, fingerprint), action: "new" };
  if (stored.puzzleFingerprint === fingerprint) return { progress: stored, action: "keep" };
  if (stored.puzzleFingerprint === null && stored.solvedCells && validateTrack(layout, stored.solvedCells).ok) {
    return { progress: { ...stored, puzzleFingerprint: fingerprint }, action: "adopt" };
  }
  return { progress: emptyProgress(key, fingerprint), action: "discard" };
}
