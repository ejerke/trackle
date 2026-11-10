# 0004. Server-authoritative checking; generator stays on the server

- Status: Accepted
- Date: 2026-11-10

## Context

Anything sent to the browser can be read by the player. If the solution or the
solver were shipped, the answer would be one dev-tools click away.

## Decision

- The puzzle generator, the solver and stored solutions exist **only on the server**.
- The client sends its board to `POST /api/puzzles/:date/check`; the server
  answers only `{ correct: boolean }`.
- The server checks with the shared `validateTrack()` (all rules satisfied). If
  a valid track ever differed from the stored solution, that would mean the
  generator produced a non-unique puzzle: the player is accepted and the server
  logs a warning.

## Consequences

- Rule validation lives in `packages/shared` and is visible in the browser. That
  is fine: with a unique solution, knowing the rules does not reveal the answer.
  The client uses the same helpers for live clue counts.
- The server is the single source of truth for "solved", which future stats,
  streaks and leaderboards depend on.
- Checking requires the network; offline play would need a different design.
