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

## Hints and answers

Same paths for daily (`/api/puzzles/:date/…?difficulty=N`) and random
(`/api/random/:difficulty/:seed/…`) puzzles ([ADR 0014](adr/0014-hints-and-answers.md)).
For a signed-in player the server records the help on the account.

### `POST …/hint`

```json
{ "cells": [[...]], "emptyCells": [[2, 3]] }      // the board, and squares marked "no track"
```

```json
200 { "kind": "mistake", "edge": "h:2:3", "cell": null }      // a wrong segment...
200 { "kind": "mistake", "edge": null, "cell": { "row": 2, "col": 3 } } // ...or a wrong "no track" mark
200 { "kind": "piece", "row": 1, "col": 4, "piece": 6 }       // the next piece logic would place
200 { "kind": "complete" }                                     // already the solution (not counted)
```

Hard allows 5 hints per puzzle (`hintLimit` in `LEVELS`). For a signed-in
player the server enforces it: the next request gets
`403 { "error": "hint_limit" }`. Signed out, the browser enforces it.

### `POST …/answer`

Body `{}`. `200 { "cells": [[...]] }`: the solution. The puzzle counts as
revealed from then on. Levels with `showAnswer: false` in `LEVELS` (Hard)
refuse for everyone: `403 { "error": "answer_unavailable" }`.

## `GET /api/archive`

Days that have a daily puzzle at `?difficulty=N` (default Medium), newest
first, never in the future. Only days someone visited have one (ADR 0005).

```json
200 { "difficulty": 1, "today": "2026-11-10", "dates": ["2026-11-10", "2026-11-09", ...] }
```

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

## Accounts

Username + password, no email ([ADR 0012](adr/0012-accounts.md)). The session
is an `HttpOnly` cookie (`trackle_session`) set by register/login. **All API
writes must send `Content-Type: application/json`** (else
`415 { "error": "unsupported_media_type" }`). Password checks have their own
rate limit.

| Endpoint | Body | Success | Errors |
| -------- | ---- | ------- | ------ |
| `GET /api/auth/me` | | `200 { user: AccountUser \| null }` | |
| `POST /api/auth/register` | `{ username, password }` | `201 { user }` + cookie | `400 invalid_username`, `400 invalid_password`, `409 username_taken` |
| `POST /api/auth/login` | `{ username, password }` | `200 { user }` + cookie | `401 invalid_credentials` |
| `POST /api/auth/logout` | `{}` | `204`, cookie cleared | |
| `POST /api/auth/password` | `{ currentPassword, newPassword }` | `204`; other sessions ended | `401 unauthorized`, `401 invalid_credentials`, `400 invalid_password` |
| `PUT /api/auth/preferences` | `{ preferredDifficulty }` | `200 { user }` | `401 unauthorized`, `400 invalid_difficulty` |
| `POST /api/auth/delete-account` | `{ password }` | `204`; user + sessions deleted | `401 unauthorized`, `401 invalid_credentials` |

`AccountUser` is `{ id, username, createdAt, preferredDifficulty }`
(`preferredDifficulty` is `null` until chosen while signed in).

## Progress sync (signed in)

The signed-in player's progress records (`PuzzleProgress` from
`@trackle/shared`, schema v4), see [ADR 0013](adr/0013-progress-sync.md). All
require a session (`401 { "error": "unauthorized" }` otherwise).

| Endpoint | Body | Response |
| -------- | ---- | -------- |
| `GET /api/me/progress` | | `200 { records: PuzzleProgress[] }` |
| `PUT /api/me/progress` | `{ records }` (≤ 200) | `200 { records }` as stored. **Automatic sync**: solves (with their finished track and time), checks, start time. Unfinished boards in these records are ignored. |
| `PUT /api/me/progress/board` | `{ record }` | `200 { record }` as stored. **Save button**: also stores the unfinished board, `boardSavedAt` = server time. A solved puzzle's board can't be replaced. |
| `DELETE /api/me/progress/:keyId` | `{}` | `204` |

Records are validated (shape, sizes, ISO timestamps, a real date or seed, a
known difficulty); an invalid record rejects the request with
`400 invalid_body`. A daily record claiming a solve is re-checked against the
stored puzzle; if `solvedCells` don't solve it, the solve is dropped.

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
