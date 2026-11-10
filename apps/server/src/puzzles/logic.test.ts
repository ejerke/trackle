import { E, N, S, W, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { attemptRng, generateCandidate } from "./generator.ts";
import { rateLogic } from "./logic.ts";

describe("rateLogic", () => {
  // The most important property: a rule may never deduce something false.
  // Check every decided square against the known solution on many puzzles.
  it("is sound: every deduction agrees with the solution (300 puzzles)", () => {
    const tiers = new Set<number | null>();
    for (let i = 0; i < 300; i++) {
      const { layout, solution } = generateCandidate(attemptRng(`sound-${i}`, 0), 6, 6, 0);
      const rating = rateLogic(layout); // would throw on a false contradiction
      tiers.add(rating.tier);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          const known = rating.cells[r]![c]!;
          if (known === 0) continue;
          expect(known === 1, `seed sound-${i} cell ${r},${c}`).toBe(solution[r]![c] !== 0);
        }
      }
      if (rating.tier !== null) {
        // Solved: every square decided.
        expect(rating.cells.flat().every((v) => v !== 0)).toBe(true);
      }
    }
    // The sample exercises every tier, so all rule sets are covered above.
    expect(tiers).toContain(1);
    expect(tiers).toContain(2);
    expect(tiers).toContain(3);
  });

  it("solves a puzzle with local rules only (tier 1)", () => {
    // 2x2 U-turn: every square is track, so each square's two exits are forced.
    const uTurn: PuzzleLayout = {
      width: 2,
      height: 2,
      rowClues: [2, 2],
      colClues: [2, 2],
      endpoints: [
        { row: 0, col: 0, dir: W },
        { row: 0, col: 1, dir: E },
      ],
      hints: [],
    };
    const rating = rateLogic(uTurn);
    expect(rating.tier).toBe(1);
    expect(rating.tier1Progress).toBe(1);
  });

  it("needs tier 2 to tell how a block of track connects", () => {
    /*
     * Found by searching generated 4x4 puzzles. Tier 1 quickly decides that
     * the top two rows are all track, but not how that 2x4 block connects:
     * only the no-loop rule (tier 2) settles it.
     *
     *      3 4 2 2
     *    ┌ ─ ─ ┐    4
     *    │ ┌ ─ ┘    4
     *  B ┘ │ · ·    2
     *    · │ · ·    1
     *      A
     */
    const layout: PuzzleLayout = {
      width: 4,
      height: 4,
      rowClues: [4, 4, 2, 1],
      colClues: [3, 4, 2, 2],
      endpoints: [
        { row: 3, col: 1, dir: S },
        { row: 2, col: 0, dir: W },
      ],
      hints: [],
    };
    const rating = rateLogic(layout);
    expect(rating.tier).toBe(2);
    expect(rating.tier3Steps).toBe(0);
    expect(rating.tier1Progress).toBeLessThan(1);
    expect(rating.cells).toEqual([
      [1, 1, 1, 1],
      [1, 1, 1, 1],
      [1, 1, 2, 2],
      [2, 1, 2, 2],
    ]);
  });

  it("reports progress as a share between 0 and 1", () => {
    for (let i = 0; i < 20; i++) {
      const { layout } = generateCandidate(attemptRng(`progress-${i}`, 0), 6, 6, 0);
      const { tier1Progress } = rateLogic(layout);
      expect(tier1Progress).toBeGreaterThanOrEqual(0);
      expect(tier1Progress).toBeLessThanOrEqual(1);
    }
  });

  it("treats given hints as known from the start", () => {
    const layout: PuzzleLayout = {
      width: 1,
      height: 3,
      rowClues: [1, 1, 1],
      colClues: [3],
      endpoints: [
        { row: 0, col: 0, dir: N },
        { row: 2, col: 0, dir: S },
      ],
      hints: [{ row: 1, col: 0, piece: N | S }],
    };
    expect(rateLogic(layout).cells).toEqual([[1], [1], [1]]);
  });
});
