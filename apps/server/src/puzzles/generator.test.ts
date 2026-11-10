import { validateTrack } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { DIFFICULTIES, profileFor, violations } from "./difficulty.ts";
import { generatePuzzle } from "./generator.ts";
import { solve } from "./solver.ts";

const seeds = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
const EASY = 0;
const MEDIUM = 1;

describe("generatePuzzle", () => {
  it.each([EASY, MEDIUM])("is deterministic for difficulty %i: same seed, same puzzle", (difficulty) => {
    const a = generatePuzzle({ difficulty, seed: "same" });
    const b = generatePuzzle({ difficulty, seed: "same" });
    expect(a).toEqual(b);
  });

  it("gives different puzzles for different seeds", () => {
    const a = generatePuzzle({ difficulty: EASY, seed: "one" });
    const b = generatePuzzle({ difficulty: EASY, seed: "two" });
    expect(a.solution).not.toEqual(b.solution);
  });

  // The most important property of the whole project.
  describe.each([
    [EASY, seeds("easy", 40)],
    [MEDIUM, seeds("medium", 15)],
  ])("difficulty %i", (difficulty, testSeeds) => {
    it.each(testSeeds)("is valid and has exactly one solution (%s)", (seed) => {
      const { layout, solution } = generatePuzzle({ difficulty, seed });
      expect(validateTrack(layout, solution)).toEqual({ ok: true });
      const result = solve(layout, 2);
      expect(result.count).toBe(1);
      expect(result.solutions[0]).toEqual(solution);
      for (const h of layout.hints) expect(solution[h.row]![h.col]).toBe(h.piece);
    });
  });

  it("only returns Medium puzzles that pass every Medium filter", () => {
    for (const seed of seeds("filters", 10)) {
      const g = generatePuzzle({ difficulty: MEDIUM, seed });
      expect(g.accepted).toBe(true);
      expect(violations(profileFor(MEDIUM).filters, g.metrics)).toEqual([]);
      expect(g.metrics.tier).toBe(2);
    }
  }, 30_000); // Medium generation takes ~100 ms per puzzle

  it("uses a single unfiltered attempt for Easy", () => {
    const g = generatePuzzle({ difficulty: EASY, seed: "easy" });
    expect(g.attempts).toBe(1);
    expect(g.accepted).toBe(true);
  });

  it("falls back to the best candidate instead of failing when nothing passes", () => {
    // Medium's 16-26 track squares can't fit on a 3x3 grid, so every candidate fails.
    const g = generatePuzzle({ difficulty: MEDIUM, seed: "tiny", width: 3, height: 3 });
    expect(g.accepted).toBe(false);
    expect(g.violations).toContain("trackCells");
    expect(g.attempts).toBe(profileFor(MEDIUM).maxAttempts);
    expect(solve(g.layout, 2).count).toBe(1); // still a valid, unique puzzle
  }, 30_000);

  it("supports other grid sizes", () => {
    for (const [width, height] of [
      [4, 4],
      [5, 7],
      [8, 8],
    ] as const) {
      const { layout, solution } = generatePuzzle({ difficulty: EASY, seed: `size-${width}x${height}`, width, height });
      expect(solution).toHaveLength(height);
      expect(validateTrack(layout, solution).ok).toBe(true);
      expect(solve(layout, 2).count).toBe(1);
    }
  });

  it("rejects unknown difficulties", () => {
    expect(() => generatePuzzle({ difficulty: DIFFICULTIES.length, seed: "x" })).toThrow(/Unknown difficulty/);
  });
});
