import { describe, expect, it } from "vitest";
import {
  CHALLENGE_DIFFICULTY,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_NAMES,
  LEVELS,
  LEVEL_ORDER,
  canShowAnswer,
  challengePoints,
  difficultyName,
  hintsLeft,
  isDailyOnly,
} from "./levels.ts";

describe("levels", () => {
  it("defines names, sizes and the default in one place", () => {
    expect(DIFFICULTY_NAMES).toEqual({ 0: "Easy", 1: "Medium", 2: "Hard", 3: "Super-duper hard", 4: "Insane", 5: "Challenge" });
    expect(LEVELS[DEFAULT_DIFFICULTY]!.name).toBe("Medium");
    expect(difficultyName(2)).toBe("Hard");
    expect(difficultyName(9)).toBe("Level 9");
    expect(LEVEL_ORDER.map(difficultyName)).toEqual(["Easy", "Medium", "Hard", "Insane", "Super-duper hard", "Challenge"]);
  });

  it("limits hints only where a level sets a limit", () => {
    expect(hintsLeft(1, 40)).toBeNull(); // Medium: unlimited
    expect(hintsLeft(2, 0)).toBe(5);
    expect(hintsLeft(2, 4)).toBe(1);
    expect(hintsLeft(2, 7)).toBe(0); // never negative
    expect(hintsLeft(3, 0)).toBe(0); // Super-duper hard: none at all
  });

  it("limits 'no track' hints separately", () => {
    expect(hintsLeft(1, 40, "empty")).toBeNull();
    expect(hintsLeft(2, 0, "empty")).toBe(LEVELS[2]!.emptyHintLimit);
    expect(hintsLeft(4, 1, "empty")).toBe(LEVELS[4]!.emptyHintLimit! - 1);
    expect(hintsLeft(3, 0, "empty")).toBe(0);
  });

  it("offers 'Show answer' on Easy and Medium, not Hard or above", () => {
    expect([0, 1, 2, 3, 4, 5].map(canShowAnswer)).toEqual([true, true, false, false, false, false]);
    expect(canShowAnswer(9)).toBe(false);
  });

  it("makes the Challenge daily-only, without hints, worth 5 points per track square", () => {
    expect(difficultyName(CHALLENGE_DIFFICULTY)).toBe("Challenge");
    expect(LEVELS.map((_, d) => isDailyOnly(d))).toEqual([false, false, false, false, false, true]);
    expect(hintsLeft(CHALLENGE_DIFFICULTY, 0, "track")).toBe(0);
    expect(hintsLeft(CHALLENGE_DIFFICULTY, 0, "empty")).toBe(0);
    expect(challengePoints({ rowClues: [3, 4, 0, 2] })).toBe(45);
  });
});
