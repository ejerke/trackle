# Trackle

A daily logic puzzle: lay a railway track from **A** to **B** across a grid so that
every row and column contains exactly as many track pieces as its clue says.

Everyone gets the same puzzle each day (by UTC date). The answer is checked by the
server; the solution never leaves it.

> This is also a learning project: documentation, testing, migrations and project
> structure are treated as first-class parts of the work. See [docs/](docs/).

## Quick start

Requirements: Node.js 24 (pinned in [mise.toml](mise.toml); run `mise install`).

```sh
npm install          # installs all workspaces
npm run dev          # server on :3000 + web on :5173 (open http://localhost:5173)
```

The SQLite database is created and migrated automatically on server start
(default `apps/server/data/trackle.db`). In dev, the server restarts when
`apps/server/src`, `apps/server/migrations` or `packages/shared/src` change, and
the browser hot-reloads on web changes.

Notes:

- The server runs TypeScript directly with Node 24 (no build step), see
  [ADR 0002](docs/adr/0002-monorepo-typescript.md).
- npm blocks dependency install scripts unless allowed. `better-sqlite3` is
  allowed in `package.json` (`allowScripts`) because it needs one to fetch or
  build its native SQLite binding.
- `npm run build` forces `NODE_ENV=production`, so a `NODE_ENV=development`
  from `mise.toml` can't accidentally produce a development build of React.

### Environment variables (server)

| Variable        | Default                       |
| --------------- | ----------------------------- |
| `HOST`          | `127.0.0.1`                   |
| `PORT`          | `3000`                        |
| `DATABASE_PATH` | `apps/server/data/trackle.db` |
| `WEB_DIST_DIR`  | `apps/web/dist`               |
| `ENABLE_LAB`    | unset; `1` enables the dev-only puzzle lab (`npm run dev` sets it). Never in production. |
| `COOKIE_SECURE` | `1`/`0`; default: on when `NODE_ENV=production`. Session cookie only over HTTPS. |
| `CLIENT_IP_HEADER` | unset (use socket address). Production behind Cloudflare: `cf-connecting-ip`. Only trusted from loopback; see [ADR 0010](docs/adr/0010-rate-limiting.md). |

## Scripts (run from the repo root)

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Server and web dev server with live reload                |
| `npm test`          | All unit and API tests (Vitest)                           |
| `npm run typecheck` | TypeScript check of every workspace                       |
| `npm run build`     | Production build of the web app                           |
| `npm start`         | Production server: API + built web app on one port        |
| `npm run backup`    | Online backup of the SQLite database (`BACKUP_DIR`, `BACKUP_KEEP`) |
| `npm run lab`       | Puzzle lab: difficulty metrics for many generated puzzles, e.g. `npm run lab -- --difficulty 1 --raw` (flags at the top of `apps/server/src/lab/lab.ts`) |

## Repository layout

```
packages/shared/   Types and rule helpers used by both server and web
apps/server/       Fastify API, SQLite, puzzle generator and solver
  migrations/      Numbered plain-SQL schema migrations
apps/web/          React + Vite single-page app
deploy/            systemd units, Caddyfile, deploy script (see docs/deployment.md)
.github/workflows/ CI: typecheck, test, build on every push
docs/              Architecture, API, database, rules, deployment, ADRs
```

## Documentation

- [Game rules and controls](docs/game-rules.md)
- [Architecture overview](docs/architecture.md)
- [HTTP API](docs/api.md)
- [Database and migrations](docs/database.md)
- [Deployment, backups and operations](docs/deployment.md)
- [Client-side progress storage](docs/client-storage.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Proposal: accounts and leaderboards](docs/proposals/accounts-and-leaderboards.md) (draft, needs decisions)
