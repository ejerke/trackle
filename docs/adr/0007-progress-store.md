# 0007. Player progress behind an async store, localStorage first

- Status: Accepted
- Date: 2026-11-10

## Context

Players should keep their board and solved status across reloads. Accounts,
stats and leaderboards will come later and will need the same data on the
server.

## Decision

- Persist progress in `localStorage` now, one key per puzzle.
- UI code depends only on an **async `ProgressStore` interface**; the current
  implementation is `LocalProgressStore`.
- Store the server-accepted answer (`solvedCells`) with the solved status, so a
  future import into an account can be re-verified by the server.

Details: [client-storage.md](../client-storage.md).

## Alternatives considered

- **Calling `localStorage` directly in components**: simplest now, but adding
  accounts would mean touching every component that reads or writes progress.
- **Anonymous server-side progress from day one** (a random client ID):
  real server work and privacy questions before any feature needs them.

## Consequences

- Adding accounts means adding a store implementation and choosing it at startup.
- Local data is untrusted: anything imported later must be re-checked server-side.
- Progress is per browser until accounts exist; clearing site data loses it.
