import { DEFAULT_DIFFICULTY, DIFFICULTY_NAMES } from "@trackle/shared";

/**
 * Small per-browser UI preferences. Unlike puzzle progress (ProgressStore),
 * these are conveniences that will never need to move to an account, so plain
 * localStorage is fine. Every access is guarded: storage can be unavailable.
 */
const DIFFICULTY_KEY = "trackle:prefs:difficulty";

export function loadPreferredDifficulty(): number {
  try {
    const value = window.localStorage.getItem(DIFFICULTY_KEY);
    const d = Number(value);
    return value !== null && Number.isInteger(d) && d in DIFFICULTY_NAMES ? d : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

export function savePreferredDifficulty(difficulty: number): void {
  try {
    window.localStorage.setItem(DIFFICULTY_KEY, String(difficulty));
  } catch {
    // Not remembering a preference is fine.
  }
}
