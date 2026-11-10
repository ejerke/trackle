# 0003. SQLite with plain-SQL migrations

- Status: Accepted
- Date: 2026-11-10

## Context

The app runs on a single self-hosted machine behind Caddy and Cloudflare. Data
is small (one puzzle per day, later users and solves). The schema must be able
to evolve as stats and accounts are added. The developer is comfortable with SQL.

## Decision

- **SQLite** in a single file, accessed with **better-sqlite3** (synchronous,
  fast, mature).
- Schema changes as **numbered plain `.sql` files** applied by a small in-house
  runner on startup, each in a transaction, tracked in `schema_migrations`.
- No ORM. Queries are hand-written SQL in a small repository module.

## Alternatives considered

- **PostgreSQL**: another service to run and back up, no benefit at this scale.
- **Built-in `node:sqlite`**: avoids a native dependency, but was not yet marked
  stable in Node 24. Worth revisiting; the API is similar.
- **Drizzle / Kysely / Prisma migrations**: useful, but hide what a migration
  actually is. Writing the runner (~50 lines) is part of the learning.

## Consequences

- Backups are a file copy (with the server stopped, or `.backup`).
- Only one server process should write. Fine for one machine; horizontal scaling
  would require a different database.
- better-sqlite3 is a native module: `npm install` needs a prebuilt binary for
  the Node version, or build tools (`gcc`, `make`, `python3`) to compile it.
