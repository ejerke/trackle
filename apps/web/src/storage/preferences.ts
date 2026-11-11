import { DEFAULT_DIFFICULTY, DIFFICULTY_NAMES, isRandomSeed } from "@trackle/shared";
import { savePreferences } from "../api";

/**
 * The chosen difficulty. Kept in this browser (so "/" opens it), and for
 * signed-in players also on the account, which wins on every page load so all
 * devices agree. Every storage access is guarded: it can be unavailable.
 */
const DIFFICULTY_KEY = "trackle:prefs:difficulty";

const isKnown = (d: number) => Number.isInteger(d) && d in DIFFICULTY_NAMES;

/** The difficulty explicitly chosen in this browser, if any. */
export function storedDifficulty(): number | null {
  try {
    const value = window.localStorage.getItem(DIFFICULTY_KEY);
    const d = Number(value);
    return value !== null && isKnown(d) ? d : null;
  } catch {
    return null;
  }
}

export function loadPreferredDifficulty(): number {
  return storedDifficulty() ?? DEFAULT_DIFFICULTY;
}

export function savePreferredDifficulty(difficulty: number): void {
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, String(difficulty));
  } catch {
    // Not remembering a preference is fine.
  }
}

/** The player picked a difficulty: remember it here, and on the account if signed in. */
export function rememberDifficulty(difficulty: number, signedIn: boolean): void {
  savePreferredDifficulty(difficulty);
  if (signedIn) void savePreferences(difficulty).catch((err) => console.warn("Could not save preference", err));
}

/**
 * After signing in / on page load: the account's choice wins; an account that
 * hasn't chosen yet adopts this browser's earlier choice.
 */
export function syncDifficultyWithAccount(accountChoice: number | null): void {
  if (accountChoice !== null && isKnown(accountChoice)) {
    savePreferredDifficulty(accountChoice);
  } else {
    const local = storedDifficulty();
    if (local !== null) void savePreferences(local).catch((err) => console.warn("Could not save preference", err));
  }
}

// ---- the last random puzzle per difficulty ----

/**
 * The random puzzle last opened at each difficulty, so switching
 * Hard → Medium → Hard on random puzzles returns to the same Hard puzzle.
 * Only "New random" makes new ones: it forgets them all, so each difficulty
 * gets a new puzzle the next time it's picked (which is then kept). Per browser.
 */
const LAST_RANDOM_KEY = "trackle:prefs:lastRandom";

function readLastRandom(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(LAST_RANDOM_KEY) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function lastRandomSeed(difficulty: number): string | null {
  const seed = readLastRandom()[String(difficulty)];
  return typeof seed === "string" && isRandomSeed(seed) ? seed : null;
}

export function rememberRandomSeed(difficulty: number, seed: string): void {
  try {
    window.localStorage.setItem(LAST_RANDOM_KEY, JSON.stringify({ ...readLastRandom(), [difficulty]: seed }));
  } catch {
    // Not remembering is fine: switching difficulty then makes a new puzzle.
  }
}

/** "New random": every difficulty starts over with a new random puzzle. */
export function forgetRandomSeeds(): void {
  try {
    window.localStorage.removeItem(LAST_RANDOM_KEY);
  } catch {
    // Then switching difficulty returns to the old puzzles; harmless.
  }
}
