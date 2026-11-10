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
  schemaVersion: 2;
  key: PuzzleKey;
  board: {
    edges: string[];                          // track segments, e.g. "h:2:3", "v:0:5"
    marks: Record<string, "track" | "empty">; // "r:c" -> mark
  };
  startedAt: string;          // ISO, first interaction
  updatedAt: string;          // ISO, last change
  checks: number;             // how many times "Check" was pressed
  solvedAt: string | null;    // set ONLY after the server answered correct: true
  solvedCells: number[][] | null; // the mask grid the server accepted
}
```

Edge keys: `h:r:c` is the segment between `(r, c)` and `(r, c+1)`;
`v:r:c` is between `(r, c)` and `(r+1, c)`. Fixed segments (hints, A/B ends)
are not stored; they come from the puzzle.

### Why these fields

- `solvedCells` keeps the accepted answer. When accounts arrive, the server can
  **re-verify** imported progress instead of trusting the browser's word.
- `startedAt` / `checks` give future stats something to work with. They come
  from the client clock, so they are fine for personal stats but **not**
  trustworthy for leaderboards (those will need server-side timing).
- `schemaVersion` allows reading old data after the format changes.

### Schema history

| Version | Change | Upgrade on read |
| ------- | ------ | --------------- |
| 1 | key `{ date, difficulty }` | → 2: key gets `kind: "daily"` |
| 2 | key is `daily` or `random` | (current) |

`migrateProgress()` walks old records up one version at a time, so the
storage key layout (`v1`) did not need to change. Tested in
`localProgressStore.test.ts`.

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

## Path to accounts

When accounts are added, nothing in the components changes:

1. Add `RemoteProgressStore` (talks to `/api/me/progress`).
2. Add `SyncedProgressStore`, which wraps local + remote: reads local first
   (fast, offline), writes both, and lets the server win on conflict for
   `solvedAt`.
3. On first login, `local.list()` is posted to an import endpoint. The server
   re-checks each `solvedCells` against the stored solution and creates `solves`
   rows (see [database.md](database.md#expected-future-tables-not-created-yet)).
4. The app picks the store at startup: logged in → synced, otherwise → local.
