# 0002. Monorepo with npm workspaces and TypeScript

- Status: Accepted
- Date: 2026-11-10

## Context

The server and the web app need the same puzzle types and rule helpers. Copying
them would let the two drift apart silently.

## Decision

- One repository with **npm workspaces**: `packages/shared`, `apps/server`, `apps/web`.
- **TypeScript everywhere**, with strict mode.
- No build step for TypeScript on the server: Node 24 runs `.ts` files directly
  (type stripping). This requires `.ts` extensions in relative imports and
  "erasable" syntax only (no `enum`, no constructor parameter properties),
  enforced by `erasableSyntaxOnly` in `tsconfig.base.json`.
- `packages/shared` is consumed as TypeScript source: Vite compiles it for the
  browser and Node strips its types on the server.
- **Fastify** for the HTTP server (built-in schema validation, good TS support,
  `inject()` for testing without opening a port).
- **Vitest** for tests in every workspace.

## Alternatives considered

- **pnpm / Turborepo / Nx**: better at scale, but more tools to learn; npm
  workspaces are built in and enough for three packages.
- **Express**: more tutorials, but no built-in validation and weaker typing.
- **Separate repositories**: shared code would need publishing or copying.

## Consequences

- A change to a shared type is checked against both apps by `npm run typecheck`.
- Anything put in `packages/shared` ends up in the browser bundle. Secrets and
  the generator/solver must never go there ([ADR 0004](0004-server-authoritative-checking.md)).
