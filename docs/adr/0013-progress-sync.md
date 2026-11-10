# 0013. Sync solves automatically; unfinished boards only on Save

- Status: Accepted
- Date: 2026-11-10
- Builds on [ADR 0007](0007-progress-store.md) and [ADR 0012](0012-accounts.md)

## Context

With accounts (ADR 0012), players expect their solves, streaks and stats on
every device. The owner decided that an *unfinished* board should reach the
account only when the player presses **Save**; everything else about the
account should sync on its own. The browser should still autosave the board
locally, so a reload never loses work.

The client was built for this: components only use the async
`ProgressStore` interface (ADR 0007).

## Decision

- **Local-first**: the browser's `LocalProgressStore` remains where the game
  reads and autosaves. `SyncedProgressStore` wraps it while signed in.
- **Automatic sync of account-level facts** (`PUT /api/me/progress`): solves
  (with their finished track) and check counts, sent when they change (solves
  immediately, checks after a short pause, everything pending when the page is
  hidden). Board edits alone send nothing. The **server enforces** this: an
  unfinished board arriving through automatic sync is dropped (`mergeSummary`).
- **Save button** (`PUT /api/me/progress/board`): stores the unfinished board
  with the server's time as `boardSavedAt` (`saveBoard`). Shown under the
  puzzle while signed in, with "Unsaved changes" / "Saved at 22:45".
- **On each page load / sign-in**, `mergeOnDevice` combines this browser with
  the account, without comparing device clocks:
  - the better solve wins everywhere (`betterSolve`: a solve beats none; the
    earlier of two solves wins), bringing its finished track;
  - a board saved elsewhere replaces this device's board only if this device
    has **no unsaved edits** (`boardDirty`). Unsaved work is never overwritten.
- **Daily solves are re-checked** against the stored puzzle; a record whose
  `solvedCells` don't solve it loses the solve. Random puzzles aren't stored
  server-side, so their solves are taken on trust.
- **Signing in** imports this browser's anonymous solves and checks (not its
  unfinished boards: those need a Save, like any other). **Signing out**
  removes the account's progress from the browser; `trackle:sync:owner`
  ensures a different account never inherits or uploads it. **Deleting the
  account** keeps the browser's copy.
- Merge rules (`betterSolve`, `mergeSummary`, `saveBoard`) live in
  `@trackle/shared`; the server applies them, and the browser's tests use the
  very same functions for their fake server.
- Progress records gained `boardSavedAt` and `boardDirty` (schema v4).

## Alternatives considered

- **Sync boards automatically too** (the first version of this ADR): convenient,
  but not what the owner wanted. A board only moves when the player says so.
- **Server as the only store while signed in**: every edit would need the
  network, and play would stop when offline.
- **Last-write-wins by timestamp for boards**: mixes clocks of different
  devices; a device with a slow clock could have its unsaved work replaced.

## Consequences

- If a device has unsaved edits, a newer save from another device isn't shown
  there until those edits are saved (overwriting the other save) or cleared.
- Random-puzzle solves in stats are unverified; anything competitive
  (leaderboards) should count daily puzzles only.
- Every page load does one `GET /api/me/progress` (all records). Fine for
  hundreds of records; paging or `?since=` would be the next step.
