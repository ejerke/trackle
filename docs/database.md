# Database and migrations

SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3).
One file, default `apps/server/data/trackle.db` (override with `DATABASE_PATH`).

Connection settings applied on open:

- `journal_mode = WAL`: readers don't block the writer; good for a web server.
- `foreign_keys = ON`: SQLite has them off by default, per connection.
- `busy_timeout = 5000`: wait instead of failing immediately if the file is locked.

## Schema

### `puzzles`

Defined in [0001_create_puzzles.sql](../apps/server/migrations/0001_create_puzzles.sql).

| Column              | Type    | Notes |
| ------------------- | ------- | ----- |
| `id`                | INTEGER | PK; future tables reference this |
| `puzzle_date`       | TEXT    | UTC `YYYY-MM-DD`, validated with `date()` |
| `difficulty`        | INTEGER | ≥ 0 |
| `width`, `height`   | INTEGER | 2–20 |
| `seed`              | TEXT    | generator input |
| `generator_version` | INTEGER | which algorithm produced it |
| `puzzle_json`       | TEXT    | public: clues, endpoints, hints |
| `solution_json`     | TEXT    | **private** mask grid; never sent to clients |
| `created_at`        | TEXT    | ISO timestamp (UTC) |

`UNIQUE (puzzle_date, difficulty)` identifies a daily puzzle and makes
concurrent "create on first request" safe.

Grids are JSON because they are always read and written whole. If something
ever needs to be queried per cell, that is the moment to normalise.

### `users` and `sessions`

Defined in [0002_users_and_sessions.sql](../apps/server/migrations/0002_users_and_sessions.sql)
([ADR 0012](adr/0012-accounts.md)).

| Table | Columns | Notes |
| ----- | ------- | ----- |
| `users` | `id`, `username` (`UNIQUE COLLATE NOCASE`), `password_hash`, `created_at`, `password_changed_at` | hash is `scrypt$N$r$p$salt$hash`, never the password |
| `sessions` | `token_hash` (PK), `user_id` → `users` `ON DELETE CASCADE`, `created_at`, `expires_at` | SHA-256 of the cookie token; expired rows are pruned on login |

### `user_progress`

Defined in [0003_user_progress.sql](../apps/server/migrations/0003_user_progress.sql)
([ADR 0013](adr/0013-progress-sync.md)). One row per (user, puzzle):
`user_id` → `users` `ON DELETE CASCADE`, `key_id` (e.g. `2026-11-10:1`),
`record_json` (the browser's record), and `updated_at` / `solved_at` copied out
of it for querying. Primary key `(user_id, key_id)`.

### Expected future tables (not created yet)

Leaderboard/group tables, once decided (see the
[proposal](proposals/accounts-and-leaderboards.md)). Verified solve times can
come from `user_progress.solved_at` for daily puzzles.

## Migrations

Migrations are plain `.sql` files in `apps/server/migrations/`, named
`NNNN_description.sql` and applied in numeric order by a small runner
(`apps/server/src/db/migrate.ts`) on server start.

The runner:

1. Creates `schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)`
   if missing.
2. Applies each file whose number is not recorded yet, **each in its own
   transaction** together with its `schema_migrations` insert. A failing
   migration leaves the database at the previous version.
3. Refuses to start if the database contains a version that no file exists for
   (e.g. running old code against a newer database).

### Rules for writing migrations

- **Never edit a migration that has been deployed.** Fix forward with a new file.
  (Before it has been deployed anywhere, editing is fine: delete your local
  `apps/server/data/` and restart to re-run it.)
- In `CHECK` constraints, remember that `NULL` *passes*: `CHECK (x = f(x))` lets
  every row through where `f(x)` is `NULL`. Use null-safe `IS` instead, as in
  `0001` (this exact bug was caught by `migrate.test.ts`).
- One logical change per file; the file holds only the change (no `BEGIN`/`COMMIT`).
- SQLite's `ALTER TABLE` is limited. For complex changes use the
  create-new-table / copy / drop / rename pattern
  ([SQLite docs](https://www.sqlite.org/lang_altertable.html#otheralter)).
- Back up the database file before deploying a migration (copy it while the
  server is stopped, or use `sqlite3 trackle.db ".backup backup.db"`).
