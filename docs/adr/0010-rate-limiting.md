# 0010. In-process token-bucket rate limiting, keyed on the real client IP

- Status: Accepted
- Date: 2026-11-10

## Context

Random puzzles are generated on demand (ADR 0009). A Medium generation blocks
Node's single event loop for ~0.1 s (up to ~0.6 s), and anyone can ask for
unlimited new seeds, so a single client could make the site unresponsive.

In production every request arrives via Cloudflare → Caddy → Node on
127.0.0.1, so Node's socket only ever sees Caddy.

## Decision

- A small **token bucket** (`apps/server/src/rateLimit/`), in memory, written
  in-house (~60 lines; easy to read and test).
- Two layers:
  - **`api`**, all `/api/*` requests, per client: 120 burst, 2/s. Stops floods;
    no person gets near it.
  - **`generation`**, charged *only* when a request must generate a puzzle (a
    random-puzzle cache miss): 10 burst, then 1 per 6 s per client, plus a
    **global** bucket shared by all clients (30 burst, 2/s) so many IPs together
    still can't use more than a bounded share of the CPU.
- Denied requests get `429 { "error": "rate_limited" }` with `Retry-After`. The
  web app shows a friendly message.
- **Client identity**: the socket address, unless `CLIENT_IP_HEADER` is set
  (production: `cf-connecting-ip`). The header is trusted **only** when the
  socket peer is loopback, i.e. our own reverse proxy. IPv6 clients are limited
  per **/64**, since one user typically controls a whole /64.

## Alternatives considered

- **`@fastify/rate-limit`**: mature and featureful (Redis store, headers). Our
  needs are small and specific (cost-based "only on cache miss", a global
  budget), and writing it is part of the learning. Switch if needs grow.
- **Cloudflare rate-limiting rules only**: useful as an extra layer, but the
  app should protect itself regardless of what sits in front of it.
- **Worker threads for generation**: keeps the event loop free, but doesn't stop
  someone from consuming all the CPU. Complementary, not a replacement.

## Consequences

- Limits are per process and reset on restart; fine for one server.
- **Deployment requirement**: the header is only trustworthy if nobody can
  reach Caddy except through Cloudflare (or Caddy overwrites the header from a
  trusted source). Otherwise an attacker can send any `CF-Connecting-IP` and
  get a fresh bucket per request. Firewall the origin to
  [Cloudflare's IP ranges](https://www.cloudflare.com/ips/), or configure
  Caddy's `trusted_proxies`.
- Many players behind one shared IP (an office, a school) share one budget.
  The generation limit only bites people who create more than ~10 random
  puzzles a minute, which is acceptable.
