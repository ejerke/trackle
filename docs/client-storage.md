# Client-side progress storage

The browser remembers, per puzzle, the board in progress and whether it was
solved, so reloading or coming back later keeps everything. There are no
accounts yet; the design is meant to let accounts slot in without rewriting
the UI.

## Design in one sentence

Components never touch `localStorage`. They talk to a **`ProgressStore`**
interface, and today the only implementation is `LocalProgressStore`.

```ts
// apps/web/src/storage/progressStore.ts
interface ProgressStore {
  get(key: PuzzleKey): Promise<PuzzleProgress | null>;
  save(progress: PuzzleProgress): Promise<void>;
  list(): Promise<PuzzleProgress[]>;      // all known puzzles: for stats/archive later
}
```

The interface is **async on purpose**, even though `localStorage` is
synchronous: a server-backed store will be async, and making callers `await`
from day one means swapping the implementation changes no component code.

## Data model

```ts
type PuzzleKey =
  | { kind: "daily"; date: string; difficulty: number }   // "2026-11-10", 1
  | { kind: "random"; seed: string; difficulty: number }; // "k3j9x2ab", 0

interface PuzzleProgress {
  schemaVersion: 5;
  key: PuzzleKey;
  puzzleFingerprint: string | null; // which puzzle the board was drawn on
  board: {
    edges: string[];                          // track segments, e.g. "h:2:3", "v:0:5"
    marks: Record<string, "track" | "empty">; // "r:c" -> mark
  };
  startedAt: string;          // ISO, first interaction
  updatedAt: string;          // ISO, last change
  checks: number;             // how many times "Check" was pressed
  solvedAt: string | null;    // set ONLY after the server answered correct: true
  solvedCells: number[][] | null; // the mask grid the server accepted
  boardSavedAt: string | null; // when this board was last saved to the account
  boardDirty: boolean;         // edits since then (device-local)
  hintsUsed: number;           // only ever grows
  revealedAt: string | null;   // answer shown: locked, never counts as solved
}
```

Edge keys: `h:r:c` is the segment between `(r, c)` and `(r, c+1)`;
`v:r:c` is between `(r, c)` and `(r+1, c)`. Fixed segments (hints, A/B ends)
are not stored; they come from the puzzle.

### Why these fields

- `solvedCells` keeps the accepted answer. When accounts arrive, the server can
  **re-verify** imported progress instead of trusting the browser's word.
- `startedAt` / `checks` give stats something to work with. They come from
  the client clock, which is fine for personal stats (there are no
  leaderboards, [ADR 0015](adr/0015-no-leaderboards.md)).
- `schemaVersion` allows reading old data after the format changes.

### Schema history

| Version | Change | Upgrade on read |
| ------- | ------ | --------------- |
| 1 | key `{ date, difficulty }` | → 2: key gets `kind: "daily"` |
| 2 | key is `daily` or `random` | → 3: `puzzleFingerprint: null` |
| 3 | adds `puzzleFingerprint` | → 4: `boardSavedAt: null`, `boardDirty` = anything drawn |
| 4 | adds `boardSavedAt`, `boardDirty` (Save button) | → 5: `hintsUsed: 0`, `revealedAt: null` |
| 5 | adds `hintsUsed`, `revealedAt` (hints and answers) | (current) |

`migrateProgress()` walks old records up one version at a time, so the
storage key layout (`v1`) did not need to change. Tested in
`localProgressStore.test.ts`.

### Never showing a board on the wrong puzzle

Each record stores `puzzleFingerprint` (a hash of the puzzle's size, clues,
endpoints and hints, from `@trackle/shared`). When a puzzle loads,
`reconcileProgress()` (`storage/reconcile.ts`) keeps the saved record only if
the fingerprint matches; a record for a different puzzle under the same key
(a regenerated puzzle, random puzzles after a generator change, a restored
database) is deleted and the board starts empty. Records from before v3 have
no fingerprint: they're kept only if solved and their saved answer still
solves the puzzle.

## localStorage layout

One key per puzzle:

```
trackle:progress:v1:2026-11-10:1         ->  daily puzzle (date, difficulty)
trackle:progress:v1:random:0:k3j9x2ab    ->  random puzzle (difficulty, seed)
```

Random puzzles have their own key kind so future stats and streaks can count
daily puzzles only. `list()` returns daily puzzles first (newest date first),
then random ones (most recently played first).

- One key per puzzle means a corrupt entry affects only that puzzle, and saving
  doesn't rewrite the whole history. `list()` scans keys with the prefix.
- The `v1` in the key prefix changes only if the *layout* changes. Changes to
  the record shape bump `schemaVersion` and go through `migrateProgress()`.

## Stats

`apps/web/src/stats.ts` computes personal stats (solves, streaks, first-try
rate, average checks) from `list()`. They're pure functions of the records, so
they'll work unchanged on records synced from an account later.

## Preferences

The last chosen difficulty is kept in `trackle:prefs:difficulty`
(`storage/preferences.ts`), so `/` opens it. For signed-in players it's also
stored on the account (`PUT /api/auth/preferences`): on each page load the
account's choice wins, and an account that hasn't chosen yet adopts the
browser's. Picking a difficulty sends it with `keepalive`, since the page
navigates away immediately.

`trackle:prefs:lastRandom` remembers the last random puzzle per difficulty,
so switching difficulty on random puzzles returns to it (per browser).

## Robustness rules

- Every `localStorage` access is wrapped in `try/catch`. Private browsing,
  disabled storage or a full quota fall back to an in-memory store for the
  session; the game still works, it just won't remember.
- Invalid JSON or an unknown `schemaVersion` is treated as "no progress"
  (and logged with `console.warn`), never a crash.
- Board saves are debounced (~300 ms) so a drag doesn't write on every move.
- A solved puzzle's board is locked; `solvedAt` is never cleared by the UI.

## Sync with accounts (built)

While signed in, `SyncedProgressStore` (`storage/syncedProgressStore.ts`) wraps
the local store; components didn't change. The browser always autosaves the
board locally, so reloads never lose work.

- **Synced automatically**: solves (with their finished track), check
  counts, hints used and a shown answer. Board edits alone send nothing.
- **Save button**: puts the unfinished board in the account, so another device
  can continue it. The record remembers `boardSavedAt` (which saved version the
  board is based on) and `boardDirty` (edits since).
- **Page load / sign-in**: `mergeOnDevice` (`storage/syncMerge.ts`) combines
  this browser with the account: the better solve wins (`betterSolve`); a board
  saved elsewhere replaces the local one only if the local one has no unsaved
  edits. No device clocks are compared.
- **Sign-in** imports this browser's anonymous solves and checks.
- **Sign-out** removes the account's progress from the browser.
  `trackle:sync:owner` records whose progress the browser holds, so a
  different account never inherits or uploads it.
- **Account deletion** keeps the browser's copy.

Details and trade-offs: [ADR 0013](adr/0013-progress-sync.md).

## Stats

`apps/web/src/stats.ts` computes personal stats (solves, streaks, first-try
rate, average checks) from `list()`. They're pure functions of the records, so
they'll work unchanged on records synced from an account later.

## Preferences

The last chosen difficulty is kept in `trackle:prefs:difficulty`
(`storage/preferences.ts`). It's a per-browser convenience that will never need
to move to an account, so it uses `localStorage` directly (still guarded).

## Robustness rules

- Every `localStorage` access is wrapped in `try/catch`. Private browsing,
  disabled storage or a full quota fall back to an in-memory store for the
  session; the game still works, it just won't remember.
- Invalid JSON or an unknown `schemaVersion` is treated as "no progress"
  (and logged with `console.warn`), never a crash.
- Board saves are debounced (~300 ms) so a drag doesn't write on every move.
- A solved puzzle's board is locked; `solvedAt` is never cleared by the UI.

## Sync with accounts (built)

While signed in, `SyncedProgressStore` (`storage/syncedProgressStore.ts`) wraps
the local store and mirrors it to the server; components didn't change. Local
stays the source the UI uses, so play is instant and works offline.

- **Saves**: local immediately; to the server after a 1.5 s pause (solves at
  once, everything pending when the page is hidden). Failed sends are retried.
- **Page load / sign-in**: fetch the account's records, upload local ones the
  server lacks or has a worse version of, mirror the merged result locally.
  The UI renders after this.
- **Merge rule** (`pickProgress`, shared with the server): solve beats
  unsolved; earlier solve beats later; else newest edit wins.
- **Sign-in** imports this browser's anonymous progress into the account.
- **Sign-out** removes the account's progress from the browser.
  `trackle:sync:owner` records whose progress the browser holds, so a
  different account never inherits or uploads it.
- **Account deletion** keeps the browser's copy.

Details and trade-offs: [ADR 0013](adr/0013-progress-sync.md).
