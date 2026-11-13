# 0023. Pace new random puzzles: one per 5 s, or solve the last

- Status: Accepted
- Date: 2026-11-13
- Amends: [0010](0010-rate-limiting.md)

## Context

Every new random seed makes the server generate a puzzle (ADR 0009). On
10×10 Insane that is ~0.1–1.3 s of CPU on the one event loop (ADR 0022).
ADR 0010's generation bucket allowed bursts of 10, so a client could still
skip through puzzles (or script it) far faster than anyone plays them.

## Decision

- **Per client and level**, a *new* random puzzle (one the server must
  generate) is allowed once 5 s have passed since the last one, or straight
  away once that last one is finished: solved (a correct check) or its
  answer shown. Going back to the last puzzle is always allowed.
  (`NewRandomGate`, policy `newRandom.intervalSeconds`.)
- Only finishing *the last* puzzle counts, once: re-checking an old solved
  puzzle earns nothing.
- Finishing also gives back the `generation` token the puzzle cost, so the
  ADR 0010 bucket (burst 10, one per 6 s) never slows "solve, next, solve".
  It still caps skipping across levels; the global budget is unchanged.
- **Random answers wait ~300 ms** before they're sent, since an answer earns
  the next puzzle like a solve. Answers only exist on Easy and Medium.
- Over the limit: the usual 429 with `Retry-After`. The random page then says
  why, counts down and loads the puzzle by itself, with a link back to the
  previous puzzle. A puzzle only becomes "your last random puzzle" (where the
  level picker returns) once it has loaded.

## Alternatives considered

- **Tighter token bucket only**: can't tell "skipping" from "solving and
  moving on", so it would slow down the players it's meant to protect.
- **Per client across all levels**: switching levels would then hit the wait
  every time; per level it doesn't.

## Consequences

- State is in memory per process, bounded (50 000 entries, least recently
  used dropped first); a restart or a dropped entry only lets a client
  through sooner.
- A client is an IP (ADR 0010), so people sharing one IP share the pace per
  level.
