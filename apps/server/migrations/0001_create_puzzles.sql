-- 0001: puzzles
--
-- One row per generated puzzle. The daily puzzle is identified by
-- (puzzle_date, difficulty), so adding more difficulties per day later
-- needs no schema change.
--
-- The public part (what the client sees) and the private solution are kept in
-- separate columns so it is hard to accidentally send the solution to clients.
--
-- Grid-shaped data is stored as JSON text: it is always read and written as a
-- whole, never queried by individual cell. json_valid() guards against garbage.
--
-- The migration runner wraps each file in a transaction and records it in
-- schema_migrations, so this file contains only the schema change itself.

CREATE TABLE puzzles (
    id                INTEGER PRIMARY KEY,

    -- ISO 8601 calendar date in UTC, e.g. '2026-11-10'.
    -- The date() round-trip rejects anything that is not a real YYYY-MM-DD date.
    -- `IS`, not `=`: date('garbage') is NULL, `x = NULL` is NULL, and a CHECK
    -- that evaluates to NULL *passes*. `IS` is null-safe and yields false.
    puzzle_date       TEXT    NOT NULL CHECK (puzzle_date IS date(puzzle_date)),

    -- 0 = easiest. Open-ended so harder levels can be added later.
    difficulty        INTEGER NOT NULL CHECK (difficulty >= 0),

    width             INTEGER NOT NULL CHECK (width  BETWEEN 2 AND 20),
    height            INTEGER NOT NULL CHECK (height BETWEEN 2 AND 20),

    -- Generator input, so a puzzle can be reproduced and debugged.
    seed              TEXT    NOT NULL,
    generator_version INTEGER NOT NULL CHECK (generator_version >= 1),

    -- Public puzzle definition: clues, endpoints (A and B), hint pieces.
    -- Shape: { rowClues: int[], colClues: int[], endpoints: [...], hints: [...] }
    puzzle_json       TEXT    NOT NULL CHECK (json_valid(puzzle_json)),

    -- PRIVATE. The unique solution as a height x width grid of direction
    -- bitmasks (N=1, E=2, S=4, W=8). Never returned by the API.
    solution_json     TEXT    NOT NULL CHECK (json_valid(solution_json)),

    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    -- Also what makes "create on first request" safe when two requests race:
    -- INSERT ... ON CONFLICT DO NOTHING, then SELECT.
    UNIQUE (puzzle_date, difficulty)
) STRICT;
