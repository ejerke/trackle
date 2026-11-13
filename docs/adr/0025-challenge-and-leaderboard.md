# 0025. The daily Challenge, and a leaderboard of its points

- Status: Accepted
- Date: 2026-11-13
- Supersedes [ADR 0015](0015-no-leaderboards.md) ("no leaderboards"), for the Challenge only.
  Builds on [0005](0005-utc-daily-puzzle-on-demand.md), [0013](0013-progress-sync.md),
  [0014](0014-hints-and-answers.md).

## Context

Two wishes met:

- A level for **puzzle purists**: no help of any kind, hard enough that not
  everyone finishes, and solvable by reasoning alone. A puzzle game we looked
  at gives only the first piece at each end of the track and nothing else.
- Something to **compete** on. ADR 0015 ruled out leaderboards because of
  cheating, solve times that can't be trusted, and public names. Those
  objections are about *timed* rankings of strangers. Ranking *whether* you
  solved a hard puzzle on its day avoids timing completely, and on a small
  site solver bots aren't worth worrying about.

Measured before deciding (300 random paths per size, end pieces as the only
givens): the solution is unique on 33% of 8×8, 23% of 9×9 and 15% of 10×10
paths. Of the 10×10 ones, a few needed guessing; the rest needed a median of
24 trial ("if this were track…") steps. Insane needs at least 12.

## Decision

**The Challenge**, a new level (difficulty 5):

- 10×10, no crossings. The pieces on A's and B's squares are **always given,
  and nothing else** (`givens: "ends"` in `difficulty.ts`). A candidate that
  isn't unique with just those is thrown away, never patched with a hint.
- Filters: tier 3 (trial reasoning, never guessing), **at least 20 trial
  steps**, no giveaway lines. About 1 path in 20 qualifies; generation takes
  ~0.2 s (median), a few seconds at worst, once a day.
- Its fallback (if no candidate passed) may never need guessing either.
- **No hints and no Show answer.** The server refuses both to everyone:
  a level whose limit for a kind of hint is 0 gives none, signed in or not,
  first try or "Try again" (this applies to Super-duper hard too).
- **Daily only** (`dailyOnly` in `LEVELS`): no random Challenges, so points
  can't be farmed. Older days are playable from the archive but score nothing.
- In the mode bar it sits beside Today and New random, not among the
  difficulties, and isn't remembered as the player's level.
- **No clock** on the page and no times in its results or stats: it's about
  whether you solve it, not how fast. The time is still recorded.
- Its page shows the leaderboard under the board (top 10 and your standing,
  this month by default or all time), which can be hidden.

**Points and the leaderboard**:

- A Challenge solved **on its own UTC day** with no help is
  worth **5 points per square of track** (`challengePoints`). Track length
  varies, so days differ a little (most are worth 175–215).
- Points are **computed, not stored**: one SQL query over `user_progress` and
  `puzzles` (`leaderboard/leaderboard.ts`). Daily solves are already
  re-checked by the server before they're stored (ADR 0013), so a board can't
  hold a solve the server didn't accept. Nothing can drift out of sync.
- Two views: **this month** (UTC calendar month) and **all time**. Equal points
  share a rank. The top 100 are listed.
- Being shown is **opt-in** (`users.on_leaderboard`, migration 0008): usernames
  were private until now. Hidden players still see their own points.
- **"On its day" is the server's word, not the browser's.** The browser's
  `solvedAt` can be backdated in a hand-made request. Instead:
  - Every correct **daily check** answers with a **solve receipt**
    `{ at, sig }`: the server's time, HMAC-signed with a secret kept in the
    database (`server_secrets`, migration 0010) over the puzzle's key id and
    `at`. Signed in or not. The browser stores it with the solve
    (`solveReceipt`, PuzzleProgress v9).
  - When a solve reaches an account, the server sets
    `user_progress.verified_at` (migration 0009) to the receipt's `at` if the
    signature is valid for that puzzle, else to its own current time. The
    earliest stamp ever seen is kept.
  - A solve scores only if `solvedAt` *and* `verified_at` are on the
    puzzle's day; `verified_at` gets 10 minutes' grace after midnight (for a
    client without a receipt whose sync is slow).
- So **signed-out play counts**: sign-up imports the browser's progress with
  its receipts, and a Challenge solved on its day scores whenever the account
  is made. A late sync doesn't matter either: every solve passes the server's
  check at the moment it's made, and the receipt remembers that moment.

We considered giving every signed-out visitor an **anonymous account** (a
random id in a cookie) so the server would see their solves directly. It gets
the same result for points, but costs a cookie and a database row for every
visitor, cleanup of abandoned ones, and merging into a real account at
sign-in. Bookmarks, streaks and stats already move to a new account through
the sign-up import; the only missing piece was a trustworthy solve time,
which the receipt carries without any of that.

## Consequences

- No timing is ranked, so ADR 0017's client-side clock stays as it is.
- Backdating is closed. Streaks still trust `solvedAt` (they're personal);
  solver bots remain possible and are accepted on a site this size.
- A receipt names the puzzle, not the player: someone could hand their
  receipt and solved board to a friend to import. That's cheating of the
  solver-bot kind and is accepted for the same reason.
- No new cookies: receipts live in local storage with the rest of the
  progress. The only cookie is still the sign-in session.
- Solves stored before migration 0009 have no `verified_at` and never score.
- Usernames become public for players who opt in, so offensive names may need
  handling one day (none is built).
- Super-duper hard's server now refuses hints too; its browser never offered
  any, so nothing changes for players.
- Adding the level needed no `GENERATOR_VERSION` bump: the other levels'
  puzzles are unchanged.
