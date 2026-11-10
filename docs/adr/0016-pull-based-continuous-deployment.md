# 0016. Deploy continuously by having the server pull CI-approved commits

- Status: Accepted
- Date: 2026-11-11

## Context

Production is a single self-hosted machine behind Cloudflare and Caddy
([deployment.md](../deployment.md)). We want every green commit on master live
without manual steps, but the origin should stay as closed as possible: only
443 (from Cloudflare) and SSH for the owner.

## Decision

- CI's `promote` job pushes each master commit that passed typecheck, tests and
  build to a `production` branch (fast-forward only).
- On the server, `trackle-deploy.timer` runs `deploy.sh --auto` every minute: it
  fetches, and if `production` moved, deploys it.
- Each deploy builds into its own immutable `releases/<sha>/` folder, backs up
  the database, then atomically switches the `current` symlink and restarts.
  A failed health check switches back to the previous release.
- A commit that failed is not retried automatically. A manual
  `deploy.sh <commit>` pins that commit and pauses auto-deploys (`HOLD`) until
  `deploy.sh` with no arguments resumes them.

## Alternatives considered

- **GitHub Actions SSHes into the server.** Needs SSH reachable from GitHub's
  huge runner IP ranges (or a Cloudflare Tunnel) and a key to the server stored
  in GitHub. More exposure and more setup than a poll.
- **Self-hosted Actions runner on the server.** Also pull-based, but it runs
  whatever the workflows say, so a workflow mistake or a public repo turns into
  code execution on the machine.
- **Build in place in one checkout** (the earlier `deploy.sh`). Simple, but
  `npm ci`/build rewrite files under the running server, and a rollback
  means a full rebuild.
- **Container images + registry.** Reproducible, but a registry, image builds
  and a container runtime are a lot of machinery for one Node process.

## Consequences

- GitHub holds no credentials for the server; the server needs only read access
  to the repo (a read-only deploy key if private).
- Deploys lag a push by CI time + up to a minute + the server-side build.
- The server runs tests again before switching, which also catches
  platform-specific problems (e.g. the native better-sqlite3 build).
- Each release has its own `node_modules`; 5 are kept, so expect a few hundred
  MB on disk.
- Automatic rollback can't undo a migration: if the old release refuses the
  newer schema, the backup taken right before the deploy must be restored by
  hand.
