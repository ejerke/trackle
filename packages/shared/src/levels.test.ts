import { describe, expect, it } from "vitest";
import { DEFAULT_DIFFICULTY, DIFFICULTY_NAMES, LEVELS, canShowAnswer, difficultyName, hintsLeft } from "./levels.ts";

describe("levels", () => {
  it("defines names, sizes and the default in one place", () => {
    expect(DIFFICULTY_NAMES).toEqual({ 0: "Easy", 1: "Medium", 2: "Hard" });
    expect(LEVELS[DEFAULT_DIFFICULTY]!.name).toBe("Medium");
    expect(difficultyName(2)).toBe("Hard");
    expect(difficultyName(9)).toBe("Level 9");
  });

  it("limits hints only where a level sets a limit", () => {
    expect(hintsLeft(1, 40)).toBeNull(); // Medium: unlimited
    expect(hintsLeft(2, 0)).toBe(5);
    expect(hintsLeft(2, 4)).toBe(1);
    expect(hintsLeft(2, 7)).toBe(0); // never negative
  });

  it("offers 'Show answer' on Easy and Medium, not Hard", () => {
    expect([0, 1, 2].map(canShowAnswer)).toEqual([true, true, false]);
    expect(canShowAnswer(9)).toBe(false);
  });
});
