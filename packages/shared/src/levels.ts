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
  /** Shorter label for narrow screens, when `name` is long. */
  shortName?: string;
  /** Grid size in squares. */
  width: number;
  height: number;
  /**
   * How many times per puzzle the player may press Hint; null = unlimited.
   * (Not the pre-placed pieces, which the code calls `layout.hints`.)
   */
  hintLimit: number | null;
  /**
   * How many times per puzzle the player may press the "No track" hint (which
   * reveals a square without track); null = unlimited. Counted separately.
   */
  emptyHintLimit: number | null;
  /** Whether "Show answer" is offered (and served by the API) at this level. */
  showAnswer: boolean;
}

/** Index = the difficulty number stored everywhere (0 = easiest). Append new levels at the end. */
export const LEVELS: readonly Level[] = [
  { name: "Easy", width: 6, height: 6, hintLimit: null, emptyHintLimit: null, showAnswer: true },
  { name: "Medium", width: 6, height: 6, hintLimit: null, emptyHintLimit: null, showAnswer: true },
  { name: "Hard", width: 8, height: 8, hintLimit: 5, emptyHintLimit: 5, showAnswer: false },
  // A joke: the hardest-sounding level is (almost) a straight line.
  { name: "Super-duper hard", shortName: "Super-duper", width: 9, height: 9, hintLimit: 0, emptyHintLimit: 0, showAnswer: false },
  // The track crosses itself once.
  { name: "Insane", width: 8, height: 8, hintLimit: 5, emptyHintLimit: 5, showAnswer: false },
];

/** Order of levels in pickers and lists: Insane before the joke level. */
export const LEVEL_ORDER: readonly number[] = [0, 1, 2, 4, 3];
if (LEVEL_ORDER.length !== LEVELS.length) throw new Error("LEVEL_ORDER must list every level");

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

/**
 * The two kinds of hint: "track" reveals a track piece, "empty" a square
 * without track. Each has its own limit and count.
 */
export type HintKind = "track" | "empty";

/** Hints of this kind still available, or null when unlimited. */
export function hintsLeft(difficulty: number, used: number, kind: HintKind = "track"): number | null {
  const level = LEVELS[difficulty];
  const max = (kind === "track" ? level?.hintLimit : level?.emptyHintLimit) ?? null;
  return max === null ? null : Math.max(0, max - used);
}
