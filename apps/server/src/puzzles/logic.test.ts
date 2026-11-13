import { E, N, S, W, validateTrack, type PuzzleLayout } from "@trackle/shared";
import { describe, expect, it } from "vitest";
import { attemptRng, generateCandidate } from "./generator.ts";
import { countSolutions, countSolutionsWithin, decidedMasks, rateLogic } from "./logic.ts";
import { solve } from "./solver.ts";

/** Unfiltered random-walk candidates with no extra hints. */
const RAW = { extraHints: 0, pathStyle: "wander", crossings: 0 } as const;

describe("rateLogic", () => {
  // The most important property: a rule may never deduce something false.
  // Check every decided square against the known solution on many puzzles.
  it("is sound: every deduction agrees with the solution (300 puzzles)", () => {
    const tiers = new Set<number | null>();
    for (let i = 0; i < 300; i++) {
      const { layout, solution } = generateCandidate(attemptRng(`sound-${i}`, 0), 6, 6, RAW)!;
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
      const { layout } = generateCandidate(attemptRng(`progress-${i}`, 0), 6, 6, RAW)!;
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

describe("countSolutions", () => {
  // Two independent algorithms (propagate-and-branch vs plain depth-first
  // search) must agree, including on puzzles with several solutions. Hints are
  // dropped to create many non-unique layouts.
  it("agrees with the brute-force solver on unique and non-unique puzzles", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 150; i++) {
      const size = 4 + (i % 3); // 4x4, 5x5, 6x6
      const { layout } = generateCandidate(attemptRng(`count-${i}`, 0), size, size, RAW)!;
      for (const hints of [layout.hints, []]) {
        const variant = { ...layout, hints };
        const expected = solve(variant, 3).count;
        expect(countSolutions(variant, 3), `count-${i} with ${hints.length} hints`).toBe(expected);
        seen.add(expected);
      }
    }
    expect(seen).toContain(1);
    expect(seen).toContain(3); // the test really covers ambiguous puzzles
  });

  it("returns 0 for contradictory puzzles", () => {
    const impossible: PuzzleLayout = {
      width: 2,
      height: 2,
      rowClues: [2, 1],
      colClues: [2, 1],
      endpoints: [
        { row: 0, col: 0, dir: W },
        { row: 0, col: 1, dir: E },
      ],
      hints: [],
    };
    expect(countSolutions(impossible)).toBe(0);
  });

  it("with a step budget, agrees with the full count or says it doesn't know", () => {
    let gaveUp = 0;
    for (let i = 0; i < 30; i++) {
      const { layout } = generateCandidate(attemptRng(`budget-${i}`, 0), 8, 8, RAW)!;
      const bare = { ...layout, hints: [] };
      const within = countSolutionsWithin(bare, 2, 50);
      if (within === null) gaveUp++;
      else expect(within).toBe(countSolutions(bare, 2));
      expect(countSolutionsWithin(layout, 2, Infinity)).toBe(countSolutions(layout, 2));
    }
    expect(gaveUp).toBeGreaterThan(0); // the budget really is small enough to run out
  });

  it("only ever decides valid tracks", () => {
    for (let i = 0; i < 100; i++) {
      const { layout, solution } = generateCandidate(attemptRng(`decided-${i}`, 0), 6, 6, RAW)!;
      const masks = decidedMasks(layout);
      if (masks === null) continue; // tiers 1-2 alone didn't finish
      expect(validateTrack(layout, masks)).toEqual({ ok: true });
      expect(masks).toEqual(solution);
    }
  });
});

describe("crossings", () => {
  const CROSSING_RAW = { extraHints: 0, pathStyle: "wander", crossings: 1 } as const;

  // The same two properties as above, on tracks that cross themselves.
  it("is sound and agrees with the brute-force solver (150 crossing puzzles)", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 150; i++) {
      const size = 5 + (i % 2);
      const { layout, solution } = generateCandidate(attemptRng(`cross-${i}`, 0), size, size, CROSSING_RAW)!;
      expect(validateTrack(layout, solution)).toEqual({ ok: true });
      const rating = rateLogic(layout);
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const known = rating.cells[r]![c]!;
          if (known !== 0) expect(known === 1, `cross-${i} cell ${r},${c}`).toBe(solution[r]![c] !== 0);
        }
      }
      for (const hints of [layout.hints, []]) {
        const variant = { ...layout, hints };
        const expected = solve(variant, 3);
        expect(countSolutions(variant, 3), `cross-${i} with ${hints.length} hints`).toBe(expected.count);
        for (const s of expected.solutions) expect(validateTrack(variant, s)).toEqual({ ok: true });
        seen.add(expected.count);
      }
    }
    expect(seen).toContain(1);
    expect(seen).toContain(3);
  });

  it("only ever decides valid crossing tracks", () => {
    for (let i = 0; i < 60; i++) {
      const { layout, solution } = generateCandidate(attemptRng(`cross-decided-${i}`, 0), 6, 6, CROSSING_RAW)!;
      const masks = decidedMasks(layout);
      if (masks !== null) expect(masks).toEqual(solution);
    }
  });
});
