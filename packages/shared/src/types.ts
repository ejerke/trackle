import type { Dir } from "./grid.ts";

/** A track end on the border. `dir` points out of the grid. */
export interface Endpoint {
  row: number;
  col: number;
  dir: Dir;
}

/** A pre-placed piece that is part of the solution. */
export interface Hint {
  row: number;
  col: number;
  /** Two-bit direction mask. */
  piece: number;
}

/** Everything needed to play a puzzle, independent of which day it belongs to. */
export interface PuzzleLayout {
  width: number;
  height: number;
  /** Track cells per row, top to bottom. */
  rowClues: number[];
  /** Track cells per column, left to right. */
  colClues: number[];
  /** [A, B]. */
  endpoints: [Endpoint, Endpoint];
  hints: Hint[];
}

/** The difficulty served when the player hasn't chosen one. */
export const DEFAULT_DIFFICULTY = 1;

/** Display names; the number is what's stored. Extend when adding levels. */
export const DIFFICULTY_NAMES: Readonly<Record<number, string>> = {
  0: "Easy",
  1: "Medium",
};

export function difficultyName(difficulty: number): string {
  return DIFFICULTY_NAMES[difficulty] ?? `Level ${difficulty}`;
}

/** A layout plus its difficulty: everything the client needs to play. */
export interface PlayablePuzzle extends PuzzleLayout {
  /** 0 = easiest. */
  difficulty: number;
}

/** A daily puzzle as the API sends it. Never contains the solution. */
export interface PublicPuzzle extends PlayablePuzzle {
  /** UTC date, "YYYY-MM-DD". */
  date: string;
}

/**
 * Random-puzzle seeds: short, lowercase, URL-safe. Strict on purpose: each seed
 * costs the server a generation, so arbitrary strings aren't accepted.
 */
export const RANDOM_SEED_PATTERN = /^[a-z0-9]{4,16}$/;

export function isRandomSeed(value: string): boolean {
  return RANDOM_SEED_PATTERN.test(value);
}
