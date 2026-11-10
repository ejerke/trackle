import { DEFAULT_DIFFICULTY, DIFFICULTY_NAMES } from "@trackle/shared";
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
