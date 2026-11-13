# 0015. No leaderboards: personal stats on the honor system

- Status: Superseded by [ADR 0025](0025-challenge-and-leaderboard.md) for the daily
  Challenge, which has an (untimed) points leaderboard. Everything else stays personal.
- Date: 2026-11-10
- Closes the leaderboard part of [the accounts proposal](../proposals/accounts-and-leaderboards.md);
  supersedes the "future leaderboards" notes in ADRs 0004, 0007, 0012–0014.

## Context

Leaderboards were on the roadmap since the start. Comparable daily puzzles
(Wordle and others) don't have them: results are personal, and looking up an
answer in advance is between the player and themselves. Ranking strangers
would also bring cheating (answers are one request away, ADR 0014), solve
timing that can't be trusted, and display-name moderation.

## Decision

- **No leaderboards**, public or among friends. Accounts exist to keep a
  player's own progress, stats and settings across devices.
- Stats stay **personal and honor-system**: hints and shown answers are still
  recorded (ADR 0014) so a player's own "on your own" count is accurate, but
  nothing is ranked against other players.

## Consequences

- No solve timing, groups or public usernames are needed; usernames stay
  private to their owner.
- Anti-cheating measures beyond keeping the solution server-side (ADR 0004)
  are unnecessary. Existing ones (re-checked daily solves, server-recorded
  help) remain because they keep personal stats honest and cost little.
- If sharing comes back, a Wordle-style "share your result" text (no server
  ranking) fits this decision.
