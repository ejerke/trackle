# 0019. Insane: tracks that cross themselves

- Status: Accepted; "given or found" superseded by [0020](0020-crossings-are-given-bridges.md)
- Date: 2026-11-11

## Context

Players wanted a level beyond Hard with a new idea in it, not only a bigger
grid. Crossings (the track passing over itself at right angles) add a new
kind of reasoning: a square may have four exits, and two exits round a
corner might belong to different passes.

## Decision

- **Insane (level 4)**: 8×8, Hard's filters (tier 3, ≥ 8 trial steps, no
  giveaway lines, tier 1 ≤ 20%, ≤ 2 hints), and the track crosses itself
  exactly once. Hint limit 3, no "Show answer".
- The layout carries `crossings` (omitted when 0, so existing layouts and
  stored puzzles are unchanged). The player is told the count, like a clue.
- A crossing is piece 15 (all four sides), passed straight over both ways,
  counted once in its row and column, and never on A's or B's square.
- **Given or found**: per candidate, a coin flip decides whether the crossing
  is a pre-placed hint (it never counts against hint removal) or is left out
  of the hint candidates entirely, so the player must find it. About half of
  Insane puzzles are each kind.
- **Solvers**: the deductive solver (logic.ts) allows 2 or 4 exits, adds a
  crossing-count rule, and does connectivity per square side ("ports"), so
  the two passes over a crossing stay separate pieces. Two exits round a
  corner of a square that could still become a crossing are not joined;
  straight-across exits always are. The brute-force solver (solver.ts) may
  re-enter a straight square at right angles.
- Levels keep their numbers (stored everywhere); `LEVEL_ORDER` shows Insane
  before Super-duper hard in pickers and stats.

## Alternatives considered

- **Crossings allowed anywhere, count not told**: harder to reason about
  fairly and much weaker for the deductive rules.
- **A separate solver for crossing puzzles**: two code paths to keep sound.
  The general one gives identical results on crossing-free puzzles.

## Consequences

- A fingerprint of 200 Easy/Medium/Hard/Super-duper puzzles *and* their
  logic ratings was identical before and after, so `GENERATOR_VERSION` stays
  3. The general tier 2 costs ~10% more time.
- logic.test.ts checks soundness and agreement with brute force on 150
  crossing layouts (with and without hints, including ambiguous ones).
- The 8×8 uniqueness tests (Hard, Insane) use the propagate-and-branch
  counter; brute force takes up to ~30 s on one Insane puzzle.
- Insane generation: median 38 ms, max ~0.75 s over 200 seeds.
