# 0014. Hints and answers, recorded so "solved it yourself" means something

- Status: Accepted; hint kinds and locking amended by [0021](0021-two-kinds-of-hint.md)
- Date: 2026-11-10

## Context

Players get stuck. They asked for a hint button and, as a last resort, a way
to see the answer. Both reveal parts of the solution, so they must be counted:
personal stats need to tell "solved it yourself" apart from "solved with help"
and "looked it up".

## Decision

- **Hints come from the server** (`POST …/hint` with the player's board, for
  daily and random puzzles). In order of preference:
  1. a **mistake**: a segment not in the solution, or a "no track" mark on a
     square that has track (fixing errors is what actually unsticks people);
  2. the **next piece logic would work out** (`deductionOrder` in
     `logic.ts`: the order the deductive solver completes squares, easiest
     first) that the player doesn't have yet, so a hint feels like a natural
     next step rather than a random reveal;
  3. **complete**: the board is already the solution (not counted as help).
  A hint reveals at most one segment or one square. The client lays a hinted
  piece on the board and highlights it; a mistake is highlighted in red.
- **Show answer** (`POST …/answer`) returns the solution after a two-click
  confirmation. The puzzle is then *revealed*: locked, shown, and never
  counted as solved.
- **Per-level limits** live in `LEVELS` (`packages/shared/src/levels.ts`):
  Hard allows 5 hints and never shows the answer. The hint limit is enforced
  by the server for signed-in players (it knows the count) and by the browser
  otherwise; answers for Hard are refused for everyone, since the server knows
  the difficulty either way.
- **Recorded in every progress record** (schema v5): `hintsUsed`, `revealedAt`.
  **Help only adds up**: merges keep the higher hint count and the earliest
  reveal, and a solve made after the answer was shown doesn't count.
- **For signed-in players the server records the help itself** when it hands
  it out (`ProgressSync.recordHelp`), rather than trusting the client to
  report it. The account rows have `hints_used` and `revealed_at` columns
  (migration 0005), so "solved it yourself" is a plain query:
  `solved_at IS NOT NULL AND hints_used = 0 AND revealed_at IS NULL`.
- Stats show "On your own" next to "Solved"; a solve with hints still counts
  as solved and for streaks; a shown answer counts for neither.

## Alternatives considered

- **Client-side hints**: would need the solution in the browser (ADR 0004).
- **Random-square hints**: simpler, but often reveal something far from where
  the player is working and give no feeling of progress.
- **Hints that explain the rule** ("row 3 is full, so…"): the best kind for
  learning, and possible later: the deductive solver already knows which rule
  fired. Out of scope for now.

## Consequences

- Help asked for while signed out is only self-reported when imported at
  sign-in, and anyone can fetch hints or answers in a second, anonymous
  browser and type them in. That's fine: stats are personal and on the honor
  system ([ADR 0015](0015-no-leaderboards.md)).
- Hints cost one logic-solver run (a few ms). Random-puzzle hints that need a
  generation fall under the generation rate limit (ADR 0010).
