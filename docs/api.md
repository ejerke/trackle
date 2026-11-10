# HTTP API

All endpoints are under `/api`, take and return JSON, and are typed in
`packages/shared/src/api.ts`. Dates are ISO `YYYY-MM-DD` in **UTC**.

## Types

```ts
type Dir = 1 | 2 | 4 | 8;               // N, E, S, W

interface PublicPuzzle {
  date: string;                          // "2026-11-10"
  difficulty: number;                    // 0 = easiest
  width: number;
  height: number;
  rowClues: number[];                    // length = height, top to bottom
  colClues: number[];                    // length = width, left to right
  endpoints: [Endpoint, Endpoint];       // A, B
  hints: Hint[];
}
interface Endpoint { row: number; col: number; dir: Dir }   // dir points out of the grid
interface Hint     { row: number; col: number; piece: number } // 2-bit direction mask
```

## Rate limits

All `/api/*` requests are rate limited per client, and requests that make the
server generate a random puzzle have a stricter limit
([ADR 0010](adr/0010-rate-limiting.md)). Over the limit:

```
429 Too Many Requests
Retry-After: <seconds>
{ "error": "rate_limited" }
```

## Difficulty

Every daily endpoint takes an optional `?difficulty=N` (0 Easy, 1 Medium).
Omitted means the default, Medium. Each difficulty has its own puzzle per day.
An unknown level returns `400 { "error": "invalid_difficulty" }`.

## `GET /api/puzzles/today`

Today's (UTC) daily puzzle at the requested difficulty, generated on first request.

```json
200 { "puzzle": PublicPuzzle, "nextPuzzleAt": "2026-11-11T00:00:00.000Z" }
```

## `GET /api/puzzles/:date`

| Case                                   | Response |
| -------------------------------------- | -------- |
| `:date` is today (UTC)                 | `200`, same as `/today` (generated if needed) |
| Past date whose puzzle exists          | `200`    |
| Past date never generated, or future   | `404 { "error": "not_found" }` |
| Not a valid `YYYY-MM-DD` date          | `400 { "error": "invalid_date" }` |

## `POST /api/puzzles/:date/check`

Checks a track. The body is the full board as a mask grid (see
[architecture.md](architecture.md#puzzle-model)):

```json
{ "cells": [[0, 6, 10, 12, 0, 0], ...] }
```

```json
200 { "correct": true }
200 { "correct": false }
```

- The response says only *whether* the track is correct, never what is wrong.
- `400 { "error": "invalid_body" }` if the body isn't `{ cells: integer[][] }`
  with values 0–15 (at most 20 × 20). A well-formed grid of the wrong size is
  simply `{ "correct": false }`.
- `404` if the puzzle does not exist. Checking never creates a puzzle.

## Random puzzles

Not stored: `(difficulty, seed)` *is* the puzzle, regenerated on demand
([ADR 0009](adr/0009-random-puzzles-by-seed.md)). Seeds must match
`^[a-z0-9]{4,16}$` (`400 { "error": "invalid_seed" }` otherwise); unknown
difficulties give `400 { "error": "invalid_difficulty" }`.

### `GET /api/random/:difficulty/:seed`

```json
200 { "puzzle": PlayablePuzzle, "seed": "k3j9x2ab" }
```

`PlayablePuzzle` is `PublicPuzzle` without `date`.

### `POST /api/random/:difficulty/:seed/check`

Same body and responses as the daily check.

## `GET /api/health`

`200 { "ok": true }`, for uptime checks.

## Development only: puzzle lab

Registered only when the server runs with `ENABLE_LAB=1` (`npm run dev` sets
it). **Never enable in production**: it lets anyone generate unlimited puzzles.

- `GET /api/lab/:difficulty/:seed` → `LabPuzzleResponse`: the puzzle (with
  `date: "lab"`), its `metrics`, `attempts`, `accepted`, `violations`,
  `generationMs`. Nothing is stored.
- `POST /api/lab/:difficulty/:seed/check` → `{ correct }`, by regenerating the
  same puzzle from the seed.

## Planned (not implemented)

- `/api/me/...` endpoints for accounts, stats and progress import
  (see [client-storage.md](client-storage.md#path-to-accounts)).
