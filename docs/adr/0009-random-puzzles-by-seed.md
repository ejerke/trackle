# 0009. Random puzzles are identified by seed, not stored

- Status: Accepted
- Date: 2026-11-10

## Context

Players want more than one puzzle a day, at a difficulty they choose. Daily
puzzles are stored (ADR 0005). Random ones could be stored too, but most would
be played once by one person and never looked up again.

Generation is deterministic (ADR 0008): `(difficulty, seed)` always produces the
same puzzle for a given `GENERATOR_VERSION`.

## Decision

- A random puzzle **is** its `(difficulty, seed)`: the URL
  `/random/<difficulty>/<seed>` fully identifies it, so it can be shared.
- The **client** picks the seed (8 random `[a-z0-9]` characters). The server
  accepts only seeds matching `^[a-z0-9]{4,16}$`.
- The server regenerates the puzzle to serve and to check it, with the seed
  prefixed (`random:<seed>`) so a random seed can never reproduce a daily puzzle.
  A 500-entry LRU cache means "load then check" generates once.
- Nothing is written to the database. Players' progress is saved in the browser
  under a separate key kind (`random`), so future stats can count daily
  puzzles only.
- Each difficulty also gets its **own daily puzzle**; `?difficulty=N` selects
  it (default Medium), and the UI remembers the last choice.

## Alternatives considered

- **Store every random puzzle**: unbounded table growth for no benefit, plus a
  write per click.
- **Server-chosen seeds**: hides the seed but needs a round-trip and state; a
  client-chosen seed costs nothing extra because the server can't be tricked
  into anything a different seed couldn't also do.

## Consequences

- **Cost per request is CPU**: a Medium generation blocks the Node event loop
  for ~0.1 s (up to ~0.6 s). Anyone can request unlimited seeds, so generation
  is rate limited per client and globally: see
  [ADR 0010](0010-rate-limiting.md).
- Bumping `GENERATOR_VERSION` changes what every random URL shows. Shared links
  from before the change show a different puzzle, and a player's saved progress
  for that seed no longer fits it. Acceptable for random puzzles; daily
  puzzles are unaffected because they are stored.
