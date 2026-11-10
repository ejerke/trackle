# 0017. Timed solves, checked automatically

- Status: Accepted
- Date: 2026-11-11
- Amends [ADR 0015](0015-no-leaderboards.md) ("no solve timing is needed").

## Context

A player had to press **Check** to find out whether the track was right, and
stats counted those presses ("first try", "average checks"). But the clues
already show when every row and column is met, and a track that follows every
rule *is* the solution (puzzles have exactly one). So pressing Check was a
formality and the check count measured almost nothing. How *fast* a puzzle
was solved is the measure players actually care about.

## Decision

- **No Check button.** As soon as the board passes `validateTrack` (the shared
  rule check, safe in the browser per ADR 0004) the track is sent to the
  server, which still decides. Each finished board is sent once.
- **A clock** measures *active* time: it starts at the first move (a board
  edit or a hint), pauses while the page is hidden, resumes when it's visible
  again (if the puzzle had started), and stops at the solve. Opening a puzzle
  without touching it doesn't start the clock. It is kept in a new record
  field `timeMs` (PuzzleProgress v6), banked at every save, so a closed tab
  loses at most the moment of closing.
- **Merging**: once solved, the time of the solve that counts (`betterSolve`)
  is final; before that, the longer of two versions wins (each device only
  adds to it). Time alone never triggers a sync, it travels with the other
  account-level facts and with Save.
- **Stats** show best and average time over puzzles solved *without hints*;
  the check count stays in the record but is no longer shown.

## Consequences

- Times come from the client and are trivially faked. That's fine: they are
  personal stats on the honor system, never ranked (ADR 0015).
- Solves from before v6 have `timeMs: 0`, meaning "not timed"; they show no
  time and are left out of time stats.
- Studying a puzzle before the first move is free time. Hiding the board until
  a Start button is pressed would close that, at the cost of an extra tap
  every day; not worth it for personal stats.
- Stored account records are now upgraded on read (`migrateProgress` on the
  server too), so rows written by older code never reach the merge rules in
  an old shape. Migration 0006 also rewrites v5 rows in place.
