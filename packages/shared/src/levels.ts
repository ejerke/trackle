/**
 * THE place for game balance that players see, per difficulty level. Shared,
 * so the server (generation, enforcing limits) and the browser (labels,
 * buttons) read the same numbers.
 *
 * The *generator's* tuning for each level (which puzzles count as Medium:
 * reasoning tier, giveaway lines, attempts…) builds on this in
 * apps/server/src/puzzles/difficulty.ts. It's server-only because it's about
 * how puzzles are made, not about playing them.
 *
 * Changing a grid size changes which puzzles get generated: bump
 * GENERATOR_VERSION (apps/server/src/puzzles/generator.ts). Changing a hint
 * limit doesn't.
 */
export interface Level {
  name: string;
  /** Grid size in squares. */
  width: number;
  height: number;
  /**
   * How many times per puzzle the player may press Hint; null = unlimited.
   * (Not the pre-placed pieces, which the code calls `layout.hints`.)
   */
  hintLimit: number | null;
  /** Whether "Show answer" is offered (and served by the API) at this level. */
  showAnswer: boolean;
}

/** Index = the difficulty number stored everywhere (0 = easiest). Append new levels at the end. */
export const LEVELS: readonly Level[] = [
  { name: "Easy", width: 6, height: 6, hintLimit: null, showAnswer: true },
  { name: "Medium", width: 6, height: 6, hintLimit: null, showAnswer: true },
  { name: "Hard", width: 7, height: 7, hintLimit: 5, showAnswer: false },
];

/** The difficulty served when the player hasn't chosen one. */
export const DEFAULT_DIFFICULTY = 1;

/** Display names by difficulty number. */
export const DIFFICULTY_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
  LEVELS.map((level, difficulty) => [difficulty, level.name]),
);

export function difficultyName(difficulty: number): string {
  return LEVELS[difficulty]?.name ?? `Level ${difficulty}`;
}

export function canShowAnswer(difficulty: number): boolean {
  return LEVELS[difficulty]?.showAnswer ?? false;
}

/** Hints still available, or null when unlimited. */
export function hintsLeft(difficulty: number, hintsUsed: number): number | null {
  const max = LEVELS[difficulty]?.hintLimit ?? null;
  return max === null ? null : Math.max(0, max - hintsUsed);
}
