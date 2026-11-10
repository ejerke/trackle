# 0006. Client-side rendering, no SSR

- Status: Accepted
- Date: 2026-11-10

## Context

React can render in the browser only (SPA) or also on the server (SSR, via a
framework such as Next.js or React Router framework mode).

## Decision

A plain **Vite + React SPA**. Node serves `index.html` and the static bundle,
and the app fetches the puzzle from the API. Routing is just "`/` or
`/YYYY-MM-DD`", parsed from `location.pathname`, with no router library yet.

## Alternatives considered

- **SSR**: faster first paint and SEO, neither of which matters much for a
  small daily puzzle. It costs hydration complexity and code that runs in two
  environments.

## Consequences

- One extra round trip (HTML → JS → API) before the grid shows. If that ever
  matters, the server can inline today's puzzle JSON into `index.html`, which
  is a small change and needs no framework.
- The server must return `index.html` for `/YYYY-MM-DD` paths (SPA fallback).
