# 0018. Consistent Easy, bigger Hard, and a joke level

- Status: Accepted
- Date: 2026-11-11

## Context

Playtesting: Easy felt inconsistent and Hard not hard enough.

Easy was the unfiltered original generator. Measured over 300 puzzles, 35%
needed connectivity reasoning (Medium's tier 2) and 8% needed trial reasoning
(Hard's tier 3); tier 1 alone decided as little as 6% of some grids. Extra
pre-placed pieces didn't help: a long, twisty track stays hard even with a
few pieces shown. Random walks are very winding (median 11 corners on 6×6).

## Decision

- New metric `turns` (corner pieces in the solution) and filters `turns`
  (range) and `minTier1Progress`.
- **Easy**: hardest tier exactly 1 (local rules finish the puzzle), 13–20
  track squares, 4–8 turns, minimal hints + 1. About 11% of raw candidates
  qualify; 500 attempts, median 6 tried.
- **Hard**: 8×8, 28–44 track squares, ≤ 1 hint, tier 1 decides ≤ 20%, at
  least 8 trial deductions (median now 19, was 11). Hint limit 5 → 3.
  Generation median 25 ms, max ~0.5 s over 200 seeds.
- **Super-duper hard (3)**: a joke. 9×9, no hints, no answer, and the track
  is a straight line across the grid with (80% of the time) one one-square
  jog: `pathStyle: "straight"` in the generation settings.
- `GENERATOR_VERSION` 2 → 3. Stored puzzles (including today's) don't change.

## Alternatives considered

- **Easy: keep unfiltered, add more hints**: hints don't remove the need for
  tier 2/3 reasoning elsewhere on a twisty track.
- **Super-duper hard via filters on random walks**: walks with ≤ 2 turns
  edge to edge are vanishingly rare; a dedicated path shape is simpler.

## Consequences

- Four levels in the picker; the long name must fit on a phone.
- If 8×8 Hard proves too slow to generate, cap `trackCells` lower or move
  generation to a worker (ADR 0011).
