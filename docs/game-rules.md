# Game rules and controls

## Rules

1. The grid (6 × 6 for Easy and Medium, 7 × 7 for Hard) has two
   track ends, **A** and **B**, on its border. Each end points out of the grid.
2. Complete a single track from A to B.
3. The clue above each column and to the right of each row is the number of
   squares in that column/row that contain track.
4. A square holds at most one piece: a **straight** (─ or │) or a **90° curve**
   (└ ┌ ┐ ┘). The track never branches, crosses itself, or forms loops.
5. Some squares may be given as **hints**: their piece is fixed and part of the
   solution.
6. Every puzzle has exactly one solution.

## Controls

A toolbar selects what a click or drag does:

| Mode         | Click / tap                           | Drag                                         |
| ------------ | ------------------------------------- | -------------------------------------------- |
| **Track**    | Near an edge between two squares: toggle the track segment across it | Lay (or remove) track along the squares you drag through |
| **Is track** | Toggle "this square has track" mark   | Mark every square dragged over               |
| **No track** | Toggle "this square is empty" mark    | Mark every square dragged over               |

- Whether a drag adds or removes is decided by the first square or segment it
  touches, so one gesture never does both.
- A square can never get more than two segments; hint pieces and the A/B ends
  cannot be changed.
- Clues update live: a clue turns red when its row/column has too much track,
  and fades when it is exactly met. (This only counts; it never reveals whether
  the track is correct.)
- **Check** sends the track to the server, which answers only correct or not.
- After solving, the page shows a countdown to the next puzzle (UTC midnight).

Above the board, a bar picks the **difficulty** (each one has its own puzzle
every day; the choice is remembered) and switches between **Today** and
**New random**. A random puzzle's link (`/random/<difficulty>/<seed>`) can be
shared: it always shows the same puzzle.

Progress is saved in the browser, so reloading keeps the board and solved state
(see [client-storage.md](client-storage.md)).

## Archive and stats

- **Archive** (`/archive`): a calendar of past daily puzzles at the chosen
  difficulty, marked solved / started / not played from this browser's
  progress. Only days somebody played have a puzzle.
- **Stats** (`/stats`): per difficulty, puzzles solved, current and best
  streak, first-try rate and average checks; plus random puzzles solved.
  A **streak** counts daily puzzles solved *on their own UTC day*; solving
  old days in the archive counts as solved but doesn't build a streak.
- Both are computed in the browser from saved progress
  ([client-storage.md](client-storage.md)), so they're per browser until
  accounts exist.

## Accounts

Optional: `/account` creates an account with a username and password (no
email, so a forgotten password can't be reset). While signed in, solves,
streaks and stats sync to every device you sign in on, and signing up imports
what you'd already solved in that browser. Your chosen difficulty follows the
account too. An unfinished puzzle stays on the
device (autosaved) until you press **Save** under it; then other devices can
continue it. Signing out removes your progress from the browser (it stays in
the account).

## Difficulty

Difficulty is an integer, `0` = easiest; higher numbers can be added later
without schema changes. Each level has its own daily puzzle; the default is
**Medium (1)**.

| Level | Feels like |
| ----- | ---------- |
| 0 Easy | Some hint pieces; much of the grid follows from obvious line counts |
| 1 Medium | No spare hints; needs "don't close a loop" reasoning, but never guessing |
| 2 Hard | 7×7; no row or column gives itself away; needs "if this were track, something breaks" reasoning several times, but never guessing |

How levels are defined and measured: [architecture.md](architecture.md#puzzle-generation).
