import { CROSSING, validateTrack } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { DIFFICULTIES, profileFor, violations } from "./difficulty.ts";
import { generatePuzzle } from "./generator.ts";
import { countSolutions } from "./logic.ts";
import { countTurns } from "./metrics.ts";
import { solve } from "./solver.ts";

const seeds = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
const EASY = 0;
const MEDIUM = 1;
const HARD = 2;
const SUPER_DUPER = 3;
const INSANE = 4;
const CHALLENGE = 5;

describe("generatePuzzle", () => {
  it.each([EASY, MEDIUM, HARD, SUPER_DUPER, INSANE, CHALLENGE])("is deterministic for difficulty %i: same seed, same puzzle", (difficulty) => {
    const a = generatePuzzle({ difficulty, seed: "same" });
    const b = generatePuzzle({ difficulty, seed: "same" });
    expect(a).toEqual(b);
  });

  it("gives different puzzles for different seeds", () => {
    const a = generatePuzzle({ difficulty: EASY, seed: "one" });
    const b = generatePuzzle({ difficulty: EASY, seed: "two" });
    expect(a.solution).not.toEqual(b.solution);
  });

  // The most important property of the whole project. Checked with the
  // independent brute-force solver where it's fast enough; on 8x8 tracks it
  // (and 10x10) can take many seconds, so those use the propagate-and-branch counter,
  // which logic.test.ts checks against brute force on hundreds of layouts.
  describe.each([
    [EASY, seeds("easy", 40), "brute force"],
    [MEDIUM, seeds("medium", 15), "brute force"],
    [SUPER_DUPER, seeds("super", 20), "brute force"],
    [HARD, seeds("hard", 15), "counter"],
    [INSANE, seeds("insane", 15), "counter"],
    [CHALLENGE, seeds("challenge", 15), "counter"],
  ])("difficulty %i", (difficulty, testSeeds, check) => {
    it.each(testSeeds)("is valid and has exactly one solution (%s)", (seed) => {
      const { layout, solution } = generatePuzzle({ difficulty, seed });
      expect(validateTrack(layout, solution)).toEqual({ ok: true });
      if (check === "brute force") {
        const result = solve(layout, 2);
        expect(result.count).toBe(1);
        expect(result.solutions[0]).toEqual(solution);
      } else {
        expect(countSolutions(layout, 2)).toBe(1);
      }
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

  it("only returns Hard puzzles that need trial reasoning but never guessing", () => {
    for (const seed of seeds("hard-filters", 10)) {
      const g = generatePuzzle({ difficulty: HARD, seed });
      expect(g.accepted).toBe(true);
      expect(g.layout.width).toBe(8);
      expect(g.layout.hints.length).toBeLessThanOrEqual(1);
      expect(g.metrics.tier3Steps).toBeGreaterThanOrEqual(8);
      expect(violations(profileFor(HARD).filters, g.metrics)).toEqual([]);
      expect(g.metrics.tier).toBe(3);
      expect(g.metrics.giveawayLines).toBe(0);
    }
  }, 30_000);

  it("only returns Easy puzzles that local rules solve, on a short, gentle track", () => {
    for (const seed of seeds("easy-filters", 20)) {
      const g = generatePuzzle({ difficulty: EASY, seed });
      expect(g.accepted).toBe(true);
      expect(g.metrics.tier).toBe(1);
      expect(g.metrics.trackCells).toBeLessThanOrEqual(20);
      expect(g.metrics.turns).toBeLessThanOrEqual(8);
    }
  });

  it("makes Super-duper hard an (almost) straight line across the biggest grid", () => {
    for (const seed of seeds("super-filters", 20)) {
      const g = generatePuzzle({ difficulty: SUPER_DUPER, seed });
      expect(g.layout.width).toBe(9);
      expect(countTurns(g.solution)).toBeLessThanOrEqual(2);
      expect(g.metrics.tier).toBe(1);
    }
  });

  it("makes Insane 10x10 tracks cross once, always given as a hint", () => {
    for (const seed of seeds("insane-filters", 12)) {
      const g = generatePuzzle({ difficulty: INSANE, seed });
      expect(g.accepted).toBe(true);
      expect(g.layout.width).toBe(10);
      expect(g.layout.crossings).toBe(1);
      expect(g.metrics.tier).toBe(3);
      expect(g.metrics.tier3Steps).toBeGreaterThanOrEqual(12);
      expect(g.layout.hints.length).toBeLessThanOrEqual(4);
      expect(g.solution.flat().filter((m) => m === CROSSING)).toHaveLength(1);
      expect(g.layout.hints.filter((h) => h.piece === CROSSING)).toHaveLength(1);
    }
  }, 30_000);

  it("gives only the two end pieces on a Challenge, and it still needs lots of trial reasoning", () => {
    for (const seed of seeds("challenge-filters", 12)) {
      const g = generatePuzzle({ difficulty: CHALLENGE, seed });
      expect(g.accepted).toBe(true);
      expect(g.layout.width).toBe(10);
      expect(g.layout.hints).toEqual(g.layout.endpoints.map(({ row, col }) => ({ row, col, piece: g.solution[row]![col]! })));
      expect(g.metrics.tier).toBe(3);
      expect(g.metrics.tier3Steps).toBeGreaterThanOrEqual(20);
      expect(g.metrics.giveawayLines).toBe(0);
    }
  }, 30_000);

  it("leaves the crossing count out of puzzles without crossings", () => {
    for (const difficulty of [EASY, MEDIUM, HARD, SUPER_DUPER, CHALLENGE]) {
      expect(generatePuzzle({ difficulty, seed: "no-cross" }).layout).not.toHaveProperty("crossings");
    }
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
