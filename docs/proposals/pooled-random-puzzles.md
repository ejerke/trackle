# Proposal: a pool of ready random puzzles

- Status: **Open.** A possible feature, not planned yet (2026-11-13).

## Problem

Every "New random" makes the browser invent a fresh seed (`newRandomSeed` in
`apps/web/src/routes.ts`), so the server always generates the puzzle while
the player waits. The server's cache (`RandomPuzzles`, 500 entries) only
helps when the *same* seed comes back: returning to your last puzzle, a
shared link, or check/hint/answer on a loaded puzzle. A generated puzzle is
never given to someone else. On 10×10 Insane that wait is ~0.14 s typically
and up to ~1.3 s ([ADR 0022](../adr/0022-insane-10x10.md)).

## Idea

Keep a small pool of ready puzzles per level, and let the server pick the
seed for a new random puzzle.

- New endpoint, e.g. `GET /api/random/:difficulty/next` → `{ seed }`. The
  browser then goes to `/random/<difficulty>/<seed>` as today, so URLs,
  sharing and "the seed is the puzzle" ([ADR 0009](../adr/0009-random-puzzles-by-seed.md))
  stay the same.
- A pooled puzzle is just a seed whose puzzle is already cached, since
  generation is deterministic.
- When the event loop is idle, top each level's pool up to a few puzzles,
  one generation at a time so requests are never blocked for long.
- "Never played it before": checkable for signed-in players from their
  progress. Signed out, the server can't know, but with ~2.8 trillion seeds a
  pooled puzzle is effectively always new to them. A pooled seed should be
  handed out once and then leave the pool.
- Seeds typed or shared by hand still generate on demand.

## Effects

- New random puzzles load instantly at every level.
- Generation CPU moves to idle time, so the per-client `generation` bucket
  would no longer be needed on this path. The 5-second pace per level
  ([ADR 0023](../adr/0023-paced-random-puzzles.md)) stays as a fairness rule
  against skipping.
- Memory: a few puzzles per level, negligible.
- After a restart the pool is empty until it refills, and the first requests
  generate on demand as today.

## Open questions

- Pool size per level, and whether the slow levels (Insane) get a bigger one.
- Whether to persist the pool across restarts (SQLite) or just refill it.
