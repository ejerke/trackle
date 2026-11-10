# 0011. Hard difficulty; propagate-and-branch uniqueness checks

- Status: Accepted
- Date: 2026-11-10

## Context

Players asked for something harder than Medium. Lab measurements
(`npm run lab -- --difficulty 2 --raw`, 300 candidates per size):

| Grid | Candidates passing the Hard filters | Need trial reasoning (tier 3) |
| ---- | ----------------------------------- | ----------------------------- |
| 6×6  | 1%  (91% have a 0/full clue)        | 35% |
| 7×7  | 8%                                  | 59% |

So Hard needs a larger grid. But on 7×7 the brute-force uniqueness solver
(`solver.ts`), called many times per candidate while hints are added and
removed, took up to **3.4 s** for one puzzle (99% of generation time), long
enough to freeze the single-threaded server.

## Decision

- **Hard (2)**: 7×7, no extra hints (≤ 2 total), **no giveaway lines**, tier 1
  may decide at most 40%, the hardest tier must be **3 (trial)**, used at
  least twice. Still never guessing.
- Uniqueness is checked with **propagate-and-branch** (`countSolutions` in
  `logic.ts`): apply the sound tier 1-2 rules, branch on an unknown edge only
  when stuck, repeat. It returns the same answers as `solver.ts`, so **no
  existing puzzle changed**: a fingerprint of 105 Easy/Medium/Hard puzzles
  was identical before and after, so `GENERATOR_VERSION` stays 2.
- `solver.ts` (plain depth-first search) stays as an independent cross-check:
  `logic.test.ts` asserts both agree on 300 layouts, including ambiguous ones.

Measured afterwards (200 puzzles each): Hard median 4 ms, max 29 ms; Medium
median 30 ms, max 167 ms (was max 567 ms).

## Alternatives considered

- **Hard on 6×6 with stricter filters**: too few candidates qualify, and the
  ones that do skew towards short tracks.
- **Worker threads for generation**: keeps the event loop free but still burns
  the CPU; making generation ~100x cheaper removes the problem at the source.
  Still an option if much larger grids are added.
- **Logic-first, brute force as fallback**: tried. Faster for unique puzzles
  but *slower* overall, because most candidates during hint selection are
  ambiguous, and those paid for both.

## Consequences

- The CPU-cost figures in ADR 0009 and ADR 0010 (0.1–0.6 s per generation)
  are now pessimistic by roughly 5–20x. The rate limits stay as a safety net.
- Hard puzzles have very little "free" progress (median 2% from tier 1) and a
  median of 11 trial deductions. If playtesting finds them brutal rather than
  hard, cap trial steps (a `maxTier3Steps` filter) or allow up to 1 giveaway line.
- Correctness of generation now rests on the soundness of `logic.ts` rules,
  which its tests check against known solutions and against `solver.ts`.
