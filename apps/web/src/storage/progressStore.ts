/**
 * Player progress persistence.
 *
 * UI code depends only on the `ProgressStore` interface, never on localStorage
 * directly. Today the implementation is `LocalProgressStore`; when accounts are
 * added, a remote/synced implementation can be swapped in at startup without
 * touching components. See docs/client-storage.md and docs/adr/0007.
 */

// The record types live in @trackle/shared: the server stores them too (ADR 0013).
export {
  CURRENT_SCHEMA_VERSION,
  emptyProgress,
  puzzleKeyId,
  type BoardState,
  type CellMark,
  type PuzzleKey,
  type PuzzleProgress,
} from "@trackle/shared";
import type { PuzzleKey, PuzzleProgress } from "@trackle/shared";

export interface ProgressStore {
  get(key: PuzzleKey): Promise<PuzzleProgress | null>;
  save(progress: PuzzleProgress): Promise<void>;
  delete(key: PuzzleKey): Promise<void>;
  /** Every stored puzzle: daily ones newest date first, then random ones most recently played first. */
  list(): Promise<PuzzleProgress[]>;
  /**
   * Stores that can put a board into the signed-in account (the Save button).
   * Absent or false `signedIn` means the button isn't offered.
   */
  readonly signedIn?: boolean;
  saveToAccount?(progress: PuzzleProgress): Promise<PuzzleProgress>;
}
