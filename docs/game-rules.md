# Game rules and controls

## Rules

1. The grid (6 × 6 for Easy and Medium, 8 × 8 for Hard and Insane, 9 × 9 for
   Super-duper hard) has two
   track ends, **A** and **B**, on its border. Each end points out of the grid.
2. Complete a single track from A to B.
3. The clue above each column and to the right of each row is the number of
   squares in that column/row that contain track.
4. A square holds at most one piece: a **straight** (─ or │) or a **90° curve**
   (└ ┌ ┐ ┘). The track never branches or forms loops, and doesn't cross
   itself, except:
   - **Crossings** (Insane): the puzzle says how many times the track crosses
     itself. A crossing (┼) is a square the track passes twice, straight over
     at right angles; it counts once in its row and column. A and B's squares
     are never crossings. Crossings are always given as hints and drawn as a
     bridge; players can't build one themselves.
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

- Keys 1, 2, 3 select the tools. With a mouse, the right button always works
  as **No track** and the middle button as **Is track** (click or drag),
  whatever tool is selected; the left button uses the selected tool.
- Whether a drag adds or removes is decided by the first square or segment it
  touches, so one gesture never does both.
- A square can never get more than two segments; hint pieces and the A/B ends
  cannot be changed.
- Clues update live: a clue turns red when its row/column has too much track,
  and fades when it is exactly met. (This only counts; it never reveals whether
  the track is correct.)
- There is no Check button: as soon as the track follows every rule it is sent
  to the server, which answers only correct or not
  ([ADR 0017](adr/0017-timed-solves.md)).
- **The clock** above the board starts with the first move, pauses while the
  page is in the background, and stops when the track is right. The solved
  panel shows the time.
- After solving, the page shows a countdown to the next puzzle (UTC midnight).

Above the board, a bar picks the **difficulty** (each one has its own puzzle
every day; the choice is remembered) and switches between **Today** and
**New random**. A random puzzle's link (`/random/<difficulty>/<seed>`) can be
shared: it always shows the same puzzle. On random puzzles, switching
difficulty returns to the last random puzzle you had at that difficulty; only
**New random** makes new ones. Since it sits beside all the difficulties, it
starts over for all of them: each difficulty gets a new puzzle the next time
it's picked, and keeps it from then on.

Progress is saved in the browser, so reloading keeps the board and solved state
(see [client-storage.md](client-storage.md)).

## Hints and answers

Under the board: **Hint** first points out a mistake if there is one (a wrong
segment, or a "no track" mark on a track square, highlighted in red);
otherwise it places the next piece logic would work out. Hard and Insane allow 3 hints
per puzzle and Super-duper hard none; Easy and Medium are unlimited. **Show answer** (Easy and Medium
only; asks for confirmation) shows the whole solution; the puzzle then counts
as *answer shown*, never as solved. Both are counted: stats show "On your own"
(solved without hints or the answer) next to "Solved".

## Archive and stats

- **Archive** (`/archive`): a calendar of past daily puzzles at the chosen
  difficulty, marked solved / started / not played from this browser's
  progress. Only days somebody played have a puzzle.
- **Stats** (`/stats`): per difficulty, puzzles solved, current and best
  streak, and best and average time (puzzles solved without hints); plus
  random puzzles solved.
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
without schema changes. Player-facing settings per level (name, grid size,
hint limit) live in one file,
[`packages/shared/src/levels.ts`](../packages/shared/src/levels.ts); how the
generator makes each level's puzzles is in
[`apps/server/src/puzzles/difficulty.ts`](../apps/server/src/puzzles/difficulty.ts). Each level has its own daily puzzle; the default is
**Medium (1)**.

| Level | Feels like |
| ----- | ---------- |
| 0 Easy | A short, gently winding track; line counts and "two exits per square" solve the whole thing |
| 1 Medium | No spare hints; needs "don't close a loop" reasoning, but never guessing |
| 2 Hard | 8×8, a long track, at most one piece given; no row or column gives itself away; needs "if this were track, something breaks" reasoning many times, but never guessing |
| 4 Insane | Hard's demands, plus the track crosses itself once, over a given bridge |
| 3 Super-duper hard | A joke: 9×9 and no hints, but the track is (almost) a straight line |

How levels are defined and measured: [architecture.md](architecture.md#puzzle-generation).
