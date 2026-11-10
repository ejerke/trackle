import { DIFFICULTY_NAMES } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { DIFFICULTIES } from "./difficulty.ts";
import { RandomPuzzles } from "./randomPuzzles.ts";

describe("RandomPuzzles", () => {
  it("returns the cached puzzle instead of regenerating", () => {
    const random = new RandomPuzzles();
    const first = random.get(0, "abcd");
    expect(random.get(0, "abcd")).toBe(first); // same object: no second generation
    expect(random.get(1, "abcd")).not.toBe(first); // difficulty is part of the key
    expect(random.size).toBe(2);
  });

  it("checks against the regenerated solution", () => {
    const random = new RandomPuzzles();
    const { solution } = random.get(0, "wxyz");
    expect(random.check(0, "wxyz", solution)).toBe(true);
    expect(random.check(0, "wxyz", solution.map((row) => row.map(() => 0)))).toBe(false);
  });
});

describe("difficulty levels", () => {
  it("has a display name for every server profile, and vice versa", () => {
    expect(Object.keys(DIFFICULTY_NAMES).map(Number)).toEqual(DIFFICULTIES.map((_, i) => i));
    DIFFICULTIES.forEach((profile, i) => expect(DIFFICULTY_NAMES[i]).toBe(profile.name));
  });
});
