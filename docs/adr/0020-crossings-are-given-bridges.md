# 0020. Crossings are given bridges

- Status: Accepted
- Date: 2026-11-11

## Context

ADR 0019 let half of Insane puzzles leave the crossing for the player to
find, so players could draw four segments into any square. In play that felt
wrong: a crossing reads as a structure the railway was built with, not a
piece you lay, and allowing four segments everywhere made mistakes easy
(dragging over a square turned it into a crossing instead of being refused).

## Decision

- The generator always gives every crossing as a hint (no coin flip).
  Insane's `maxHints` goes from 2 to 3, so it still allows at most 2 hints
  besides the crossing.
- Players can't build crossings: every square takes at most two player
  segments. The one exception is a puzzle made before this change, which
  tells of more crossings than it gives as hints; there the old rule still
  applies, so it stays solvable.
- A crossing is drawn as a bridge: the north-south track runs underneath, the
  east-west one over a deck with flared parapets.

## Alternatives considered

- **Keep "find the crossing" puzzles but draw found crossings as bridges**:
  still needs four-segment squares everywhere, which was the problem.

## Consequences

- Insane random puzzles changed for the same seed (generation consumed one
  fewer random number). Insane was hours old, so saved random boards were
  few; stored daily puzzles are unchanged. `GENERATOR_VERSION` stays 3, as
  other levels are unaffected.
- Insane generation: median ~24 ms, max ~0.5 s over 60 seeds; none rejected.
