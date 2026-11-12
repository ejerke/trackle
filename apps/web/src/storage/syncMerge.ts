import { EMPTY_BOARD, betterSolve, mergedTime, type PuzzleProgress } from "@trackle/shared";

/**
 * Device-side merge rules for progress sync (ADR 0013). The server keeps the
 * account's solves and *saved* boards; this device keeps its own autosaved
 * board, which may have unsaved edits.
 */

/**
 * The account-level part of a record, as sent by automatic sync: an
 * unfinished board is left out (it only reaches the account via Save).
 */
export function toSummary(p: PuzzleProgress): PuzzleProgress {
  return p.solvedAt || p.revealedAt ? p : { ...p, board: EMPTY_BOARD };
}

/** Changes when something the account cares about changes (not on board edits). */
export function summaryKey(p: PuzzleProgress): string {
  return JSON.stringify([p.puzzleFingerprint, p.checks, p.solvedAt, p.hintsUsed, p.emptyHintsUsed, p.revealedAt]);
}

export interface DeviceMerge {
  /** What this device should keep locally. */
  local: PuzzleProgress;
  /** This device knows something the account doesn't (a solve, more checks). */
  push: boolean;
}

/**
 * Combine this device's record with the account's.
 *
 *  - Solves: the better solve (betterSolve) wins on both sides; a solve from
 *    the account brings its finished track.
 *  - Help (ADR 0014) only ever adds up: the higher hint count and an answer
 *    shown on either side win; a shown answer brings the solution board.
 *  - Time: the solve's time once solved, else the longer of the two.
 *  - Boards: a board saved from another device replaces this device's board
 *    only if this device has no unsaved edits. Unsaved work is never
 *    overwritten, and no device clocks are compared.
 */
export function mergeOnDevice(local: PuzzleProgress | null, remote: PuzzleProgress | null): DeviceMerge {
  if (!local && !remote) throw new Error("nothing to merge");
  if (!local) return { local: { ...remote!, boardDirty: false }, push: false };
  if (!remote) return { local, push: true };

  let out: PuzzleProgress = {
    ...local,
    checks: Math.max(local.checks, remote.checks),
    hintsUsed: Math.max(local.hintsUsed, remote.hintsUsed),
    emptyHintsUsed: Math.max(local.emptyHintsUsed, remote.emptyHintsUsed),
  };
  let push =
    local.checks > remote.checks || local.hintsUsed > remote.hintsUsed || local.emptyHintsUsed > remote.emptyHintsUsed;

  if (remote.revealedAt && !local.revealedAt && !local.solvedAt) {
    out = { ...out, revealedAt: remote.revealedAt, board: remote.board, boardSavedAt: remote.boardSavedAt, boardDirty: false };
  } else if (local.revealedAt && !remote.revealedAt && !remote.solvedAt) {
    push = true;
  }

  const solve = betterSolve(local, remote);
  if (solve === remote && remote.solvedAt !== local.solvedAt) {
    out = {
      ...out,
      solvedAt: remote.solvedAt,
      solvedCells: remote.solvedCells,
      board: remote.board,
      boardSavedAt: remote.boardSavedAt,
      boardDirty: false,
    };
  } else if (solve === local && local.solvedAt !== remote.solvedAt) {
    push = true;
  }

  if (!out.solvedAt && !out.revealedAt && remote.boardSavedAt && remote.boardSavedAt !== local.boardSavedAt && !local.boardDirty) {
    out = { ...out, board: remote.board, boardSavedAt: remote.boardSavedAt };
  }
  // Time rides along with the other facts; on its own it never triggers a push.
  return { local: { ...out, timeMs: mergedTime(out, remote, local) }, push };
}
