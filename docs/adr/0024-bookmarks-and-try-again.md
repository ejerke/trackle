# 0024. Bookmarks, and "Try again" that never changes a result

- Status: Accepted
- Date: 2026-11-13
- Builds on [0013](0013-progress-sync.md), [0014](0014-hints-and-answers.md)

## Context

Players asked for two things:

- a **bookmark** on any puzzle, collected on a Bookmarks page, mostly as a
  list of puzzles they haven't managed to solve yet;
- **Try again** on a finished puzzle (solved, or the answer shown): an empty
  board, new hints, and a Show answer on *every* level, Insane included.

The risk with Try again is honesty of stats (ADR 0014): the record's hint
counts only grow and a shown answer can't be undone. Resetting them would let
a puzzle later look solved, or solved without help, and a solve after a shown
answer could build a streak.

## Decision

Progress records move to **v8** with two fields.

- `bookmark: { on, at, name? } | null`. Synced like any account-level fact. It is
  kept when switched off (`on: false`, so a name survives), and of two versions
  the more recent `at` wins (`newerBookmark`); renaming sets `at` too. The
  optional `name` (at most 40 characters, `cleanBookmarkName`) tells apart
  puzzles that would otherwise all be "Random · Insane". That compares device clocks, which ADR 0013
  avoids for boards; for a bookmark the worst case is a bookmark that comes
  back, so simple wins. A record can now exist with nothing played, so stats
  and the archive count only records that were `played()`.
- `replay: { board, hintsUsed, emptyHintsUsed, solvedAt, revealedAt, timeMs, startedAt } | null`.
  Try again creates it; the **first attempt's fields are never touched**. The
  game works on `currentAttempt(record)` and writes back with
  `withAttempt()`, which copies only the replay's own fields, so checks or a
  solve during a replay can't reach `solvedAt`, `hintsUsed` or `timeMs`.
  Stats and streaks read only the first attempt, so a replay counts for
  nothing, whatever happened first.
- The replay is **device-local**: sync sends `replay: null` (`toSummary`),
  the server's schema accepts only `null`, and `mergeSummary` always stores
  `null`. Merges on the device keep the local replay.
- **Show answer during a replay** comes from the record itself (the accepted
  `solvedCells`, or the board of the shown answer), so the server's rule that
  Hard and Insane never serve answers stays as it is.
- **Hints during a replay**: the server gives hints for a puzzle the
  signed-in player has already finished without checking or counting them
  (limits for the replay live in the browser, as when signed out).

## Alternatives considered

- **Reset the record and remember "was revealed" separately**: every place
  that reads the record (stats, server, sync, merge) would need to know about
  it, and an old client could sync a reset record.
- **Sync the replay**: it would need its own merge rules and Save button
  semantics, for a practice board nobody asked to continue elsewhere.
- **Bookmarks as their own table and API**: one more thing to import on sign
  up and clear on sign out. In the record, it rides along with what exists.

## Consequences

- Signing out drops a replay in progress (like any local board).
- A solved player can get unlimited hints on that puzzle from the API. They
  already solved it, so nothing is gained.
