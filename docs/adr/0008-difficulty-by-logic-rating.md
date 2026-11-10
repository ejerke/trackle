# 0008. Difficulty by logic rating, with deterministic generate-and-filter

- Status: Accepted
- Date: 2026-11-10

## Context

The first generator (random path, minimal hints + 2) produced puzzles that
playtesting found easy. Clues of 0 or a full line, and squares forced by
purely local reasoning, often decided most of the grid at a glance. A unique
solution says nothing about *how hard* it is to find.

Generation must stay deterministic: the same seed must reproduce the same
puzzle for debugging and tests.

## Decision

- Each difficulty is a **profile** in `apps/server/src/puzzles/difficulty.ts`:
  grid size, extra hints, an attempt limit, and optional **filters**.
- A **deductive solver** (`logic.ts`) solves like a person, using the easiest
  rule tier that makes progress:
  1. local rules (line counts, every track square has exactly two exits),
  2. connectivity (no loops, no premature A–B join),
  3. one-step trial ("assuming X leads to a contradiction").

  It reports the hardest tier needed (or "needs guessing"), and how much tier 1
  alone decides (`tier1Progress`, over squares *and* connections).
- The generator produces candidates and returns the first that passes every
  filter. Attempt *n* uses its own RNG seeded with `${seed}#${n}`. The limit is
  an **attempt count, never a time budget**, so results don't depend on machine
  speed. If nothing passes, the candidate with the fewest failed filters is
  used, so the daily puzzle never fails to generate.
- Easy (0) is the original generator with no filters. Medium (1) is the daily
  default: hardest tier exactly 2, tier 1 decides at most 60%, at most one
  giveaway line, 16–26 track squares.
- A development-only **lab** (`npm run lab`, `/lab/<difficulty>/<seed>` with
  `ENABLE_LAB=1`) shows metric distributions and lets candidates be play-tested.

## Alternatives considered

- **Structural filters only** (track length, giveaway lines, hint count): cheap,
  but they can only reject easy puzzles, not identify hard ones.
- **Time-boxed search for the "best" puzzle**: non-deterministic across machines.
- **Adding hints until logic-solvable** (instead of rejecting): fewer
  rejections, but hints change the feel. Possible later as another profile option.

## Consequences

- Every profile or rule change must bump `GENERATOR_VERSION`. Stored puzzles
  never change.
- Rules in `logic.ts` must be *sound*. A rule that deduces something false would
  mis-rate puzzles. `logic.test.ts` checks every deduction against known
  solutions on hundreds of puzzles.
- Medium generation takes ~100 ms (max ~0.6 s), once per day.
- Tier 3 rescued every sampled puzzle so far, so "needs guessing" is rare; harder
  levels may need stronger tiers to tell puzzles apart.
