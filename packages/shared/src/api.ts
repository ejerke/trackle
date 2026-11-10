import type { PuzzleProgress } from "./progress.ts";
import type { PlayablePuzzle, PublicPuzzle } from "./types.ts";

/** GET /api/puzzles/today and GET /api/puzzles/:date */
export interface PuzzleResponse {
  puzzle: PublicPuzzle;
  /** ISO timestamp of the next UTC midnight, for the countdown. */
  nextPuzzleAt: string;
}

/** GET /api/archive?difficulty=N: days that have a puzzle at this difficulty. */
export interface ArchiveResponse {
  difficulty: number;
  /** Today's UTC date, so clients don't depend on their own clock. */
  today: string;
  /** Newest first. Only days someone visited have a puzzle (ADR 0005). */
  dates: string[];
}

/** GET /api/random/:difficulty/:seed */
export interface RandomPuzzleResponse {
  puzzle: PlayablePuzzle;
  seed: string;
}

/** POST /api/puzzles/:date/check and POST /api/random/:difficulty/:seed/check */
export interface CheckRequest {
  /** height x width grid of direction masks, including the A/B outward bits. */
  cells: number[][];
}

export interface CheckResponse {
  correct: boolean;
}

/** How hard a puzzle is, as measured by the server's generator. Not secret. */
export interface PuzzleMetrics {
  /** Squares the full track occupies. */
  trackCells: number;
  /** Track squares the player has to work out (not given as hint or A/B). */
  toPlace: number;
  hints: number;
  /** Rows/columns whose clue is 0 or the full line length. */
  giveawayLines: number;
  /** Hardest deduction tier needed (1 local, 2 connectivity, 3 trial), null = needs guessing. */
  tier: 1 | 2 | 3 | null;
  /** Share of initially unknown facts (squares and connections) that tier-1 rules alone decide, 0..1. */
  tier1Progress: number;
  tier2Steps: number;
  tier3Steps: number;
}

/** GET /api/lab/:difficulty/:seed (development only). */
export interface LabPuzzleResponse {
  puzzle: PublicPuzzle;
  seed: string;
  metrics: PuzzleMetrics;
  /** Candidates generated before one passed (or the limit was hit). */
  attempts: number;
  /** False if no candidate passed every filter and the best one was used. */
  accepted: boolean;
  /** Filters the returned puzzle fails (empty when accepted). */
  violations: string[];
  generationMs: number;
}

// ---- accounts (username + password, no email; ADR 0012) ----

export interface AccountUser {
  id: number;
  /** As the user typed it; unique ignoring case. */
  username: string;
  createdAt: string;
}

/** GET /api/auth/me and the result of register/login. */
export interface AuthResponse {
  /** null when not signed in. */
  user: AccountUser | null;
}

/** POST /api/auth/register and POST /api/auth/login */
export interface Credentials {
  username: string;
  password: string;
}

/** POST /api/auth/password */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** POST /api/auth/delete-account */
export interface DeleteAccountRequest {
  password: string;
}

/** GET /api/me/progress, and the merged result of PUT /api/me/progress. */
export interface ProgressListResponse {
  records: PuzzleProgress[];
}

/**
 * PUT /api/me/progress (at most 200 records): automatic sync of account-level
 * facts. Unfinished boards in these records are ignored by the server.
 */
export interface ProgressSyncRequest {
  records: PuzzleProgress[];
}

/** PUT /api/me/progress/board: the player pressed Save. */
export interface ProgressSaveRequest {
  record: PuzzleProgress;
}

export interface ProgressSaveResponse {
  /** As stored; boardSavedAt is the server's time of this save. */
  record: PuzzleProgress;
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN_LENGTH = 8;
/** Caps hashing cost; long passphrases are still fine. */
export const PASSWORD_MAX_LENGTH = 200;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

export type ApiErrorCode =
  | "not_found"
  | "invalid_date"
  | "invalid_body"
  | "invalid_difficulty"
  | "invalid_seed"
  | "rate_limited"
  | "unsupported_media_type"
  | "invalid_username"
  | "invalid_password"
  | "username_taken"
  | "invalid_credentials"
  | "unauthorized";

export interface ApiError {
  error: ApiErrorCode;
}
