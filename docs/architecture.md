# Architecture overview

## The pieces

```
 Browser                                  Your server machine
┌─────────────────────────┐   HTTPS   ┌─────────────┐  HTTP  ┌──────────────────────────┐
│ React SPA (apps/web)    │ ────────▶ │ Cloudflare  │ ─────▶ │ Caddy (reverse proxy)    │
│  - draws grid, input    │           └─────────────┘        └────────────┬─────────────┘
│  - live clue counts     │                                               │ 127.0.0.1:3000
│  - progress in          │                                  ┌────────────▼─────────────┐
│    localStorage         │ ◀──────── JSON + static files ── │ Node + Fastify           │
└─────────────────────────┘                                  │  (apps/server)           │
                                                             │  - /api/* routes         │
         packages/shared ── imported by both ──              │  - generator + solver    │
         (types, rule helpers, dates)                        │  - serves built web app  │
                                                             └────────────┬─────────────┘
                                                                          │ better-sqlite3
                                                                   ┌──────▼──────┐
                                                                   │ trackle.db  │
                                                                   └─────────────┘
```

One Node process serves both the API and the built frontend files, so production
is a single service behind Caddy. In development, Vite serves the frontend on
:5173 and proxies `/api` to the server on :3000.

## What lives where

The most important boundary in the project is **what the browser may know**.

| Code                                  | Location          | Reaches the browser? |
| ------------------------------------- | ----------------- | -------------------- |
| Types (puzzle, API shapes)            | `packages/shared` | yes                  |
| Grid helpers, live clue counting      | `packages/shared` | yes                  |
| Track validation (`validateTrack`)    | `packages/shared` | yes, but harmless*   |
| UTC date helpers                      | `packages/shared` | yes                  |
| Path generator, solver                | `apps/server`     | **no**               |
| Stored solutions                      | SQLite            | **no**               |

\* Because every puzzle has exactly one solution, "this track satisfies all rules"
is the same as "this track is the solution". Validation needs no secret, so
sharing it leaks nothing. The server still decides officially (see
[ADR 0004](adr/0004-server-authoritative-checking.md)), which future stats rely on.

## Puzzle model

Directions are bit flags: `N = 1, E = 2, S = 4, W = 8`.

- A **cell mask** is the OR of the directions a cell's track leaves through.
  `0` = empty; a valid piece has exactly two bits (`N|S` = │, `E|W` = ─,
  `N|E` = └, `E|S` = ┌, `S|W` = ┐, `W|N` = ┘).
- An **endpoint** is `{ row, col, dir }`: a border cell plus the direction that
  points out of the grid. There are exactly two (A and B).
- A **hint** is `{ row, col, piece }`.
- A **solution** is a `height × width` grid of cell masks. Endpoint cells include
  their outward bit.

The player's board on the client is stored as **edges** (segments between two
adjacent cells) plus **cell marks** (`track` / `empty`), because that is what the
player edits. Edges are converted to a mask grid for checking.

## Daily and random puzzles

Daily puzzles are stored, one per UTC day per difficulty. Random puzzles are
not stored: `(difficulty, seed)` regenerates them deterministically
([ADR 0009](adr/0009-random-puzzles-by-seed.md)).

Generation costs CPU, so the API is rate limited per client, with a strict
extra budget for puzzle generation ([ADR 0010](adr/0010-rate-limiting.md)).

## Daily puzzle flow

1. The client loads `/` (or `/YYYY-MM-DD`) and requests the puzzle from the API.
2. The server computes *today* as the **UTC** date. A player whose local date is
   already tomorrow still gets the UTC day's puzzle
   ([ADR 0005](adr/0005-utc-daily-puzzle-on-demand.md)).
3. If no row exists for today, the server generates one from a seed derived from
   the date, inserts it with `ON CONFLICT DO NOTHING`, then reads it back. Two
   simultaneous first requests both end up with the same puzzle.
4. Past dates are served only if that day's puzzle was created. Missing past
   dates and all future dates return 404.
5. The response contains the public puzzle plus `nextPuzzleAt` (next UTC midnight)
   for the countdown.

## Puzzle generation

Implemented in `apps/server/src/puzzles/`. All randomness comes from a seeded
PRNG, so the same seed always yields the same puzzle (reproducible tests and bugs).
Why it works this way: [ADR 0008](adr/0008-difficulty-by-logic-rating.md).

**One candidate** (`generator.ts`):

1. **Path**: random self-avoiding walk between two border cells, each end
   pointing outward, 35–70% of the grid area long.
2. **Clues**: count track cells per row and column.
3. **Uniqueness**: count solutions (stopping at 2) with propagate-and-branch
   (`countSolutions` in `logic.ts`: apply the tier 1–2 rules, branch on an
   unknown edge only when stuck). While there is more than one, reveal a random
   track cell as a hint. The slower brute-force `solver.ts` is kept as an
   independent cross-check in tests ([ADR 0011](adr/0011-hard-difficulty.md)).
4. **Minimise**: drop each hint not needed for uniqueness.
5. **Extras**: add the profile's `extraHints`.

**Rating** (`logic.ts`, `metrics.ts`): a deductive solver works the puzzle like
a person, always using the easiest rule tier that makes progress:

| Tier | Rules |
| ---- | ----- |
| 1 local | line counts (full / satisfied lines); a track square has exactly two exits; a square with < 2 possible exits is empty |
| 2 connectivity | never close a loop; never join A to B before every track square is included |
| 3 trial | assume a square/segment one way; if tiers 1–2 hit a contradiction, it's the other way |

Metrics: hardest tier needed (`null` = needs guessing), `tier1Progress` (share
of unknown squares *and* connections tier 1 alone decides), track length,
squares to work out, hints, giveaway lines (clues of 0 or full).

**Levels and difficulty profiles.** Player-facing settings per level (name,
grid size, hint limit) are in `LEVELS` (`packages/shared/src/levels.ts`), the
one place for game balance players see. The server's `difficulty.ts` adds how
to generate each level (extra pieces given, an attempt limit, filters on the
metrics above):

| Level | Profile |
| ----- | ------- |
| 0 Easy | 6×6; original generator: minimal hints + 2, no filters |
| 1 Medium (default) | 6×6; no extra hints; tier exactly 2; tier 1 decides ≤ 60%; ≤ 1 giveaway line; 16–26 track squares |
| 2 Hard | 7×7; ≤ 2 hints; tier exactly 3, at least 2 trial steps; tier 1 decides ≤ 40%; no giveaway lines; 22–34 track squares |

**Generate-and-filter**: attempt *n* builds a candidate with the RNG for
`${seed}#${n}` and returns the first that passes every filter. Cheap filters
(track length, giveaway lines) run before the expensive steps. The limit is an
attempt *count*, never a time, to stay deterministic across machines. If
nothing passes, the candidate failing the fewest filters is used.

`generator_version` is stored with every puzzle. Changing the algorithm *or a
profile* bumps it; existing puzzles stay as they are in the database.

### Tuning: the lab (development only)

- `npm run lab -- --difficulty 1 --count 200`: metric distributions of
  generated puzzles, generation time, and a few puzzles drawn as text.
- `--raw`: unfiltered candidates, showing how often each filter rejects.
- With `npm run dev` (which sets `ENABLE_LAB=1`), play any candidate at
  `http://localhost:5173/lab/<difficulty>/<seed>`, with its metrics shown.
  Progress there is in memory only and never mixes with daily progress.

## Rendering

The web app is a client-side rendered SPA; there is no SSR
([ADR 0006](adr/0006-client-side-rendering.md)). The board is an SVG, which makes
drawing track segments and hit-testing edges straightforward.

## Delivery

CI (GitHub Actions) installs from the lockfile, typechecks, tests and builds
every push. Production is one systemd service behind Caddy and Cloudflare,
deployed with `deploy/deploy.sh`, with daily online SQLite backups:
[deployment.md](deployment.md).

## Further reading

- [api.md](api.md): HTTP endpoints
- [database.md](database.md): schema and migrations
- [client-storage.md](client-storage.md): progress persistence and the path to accounts
- [adr/](adr/README.md): why things are the way they are
