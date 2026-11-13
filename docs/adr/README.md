# Architecture Decision Records

An ADR is a short note recording **one** significant decision: the context, the
choice, and its consequences. They are never rewritten after acceptance. If a
decision changes, a new ADR supersedes the old one and the old one's status is
updated to point to it.

Template: copy [0000-template.md](0000-template.md) to the next number.

| #    | Decision                                                            | Status   |
| ---- | ------------------------------------------------------------------- | -------- |
| 0001 | [Record architecture decisions](0001-record-architecture-decisions.md) | Accepted |
| 0002 | [Monorepo with npm workspaces and TypeScript](0002-monorepo-typescript.md) | Accepted |
| 0003 | [SQLite with plain-SQL migrations](0003-sqlite-plain-sql-migrations.md) | Accepted |
| 0004 | [Server-authoritative checking; generator stays on the server](0004-server-authoritative-checking.md) | Accepted |
| 0005 | [Daily puzzle by UTC date, generated on first request](0005-utc-daily-puzzle-on-demand.md) | Accepted |
| 0006 | [Client-side rendering, no SSR](0006-client-side-rendering.md)       | Accepted |
| 0007 | [Player progress behind an async store, localStorage first](0007-progress-store.md) | Accepted |
| 0008 | [Difficulty by logic rating, deterministic generate-and-filter](0008-difficulty-by-logic-rating.md) | Accepted |
| 0009 | [Random puzzles are identified by seed, not stored](0009-random-puzzles-by-seed.md) | Accepted |
| 0010 | [In-process token-bucket rate limiting, keyed on the real client IP](0010-rate-limiting.md) | Accepted |
| 0011 | [Hard difficulty; propagate-and-branch uniqueness checks](0011-hard-difficulty.md) | Accepted |
| 0012 | [Username + password accounts with cookie sessions](0012-accounts.md) | Accepted |
| 0013 | [Sync progress to the account, local-first](0013-progress-sync.md) | Accepted |
| 0014 | [Hints and answers, recorded so "solved it yourself" means something](0014-hints-and-answers.md) | Accepted |
| 0015 | [No leaderboards: personal stats on the honor system](0015-no-leaderboards.md) | Superseded by 0025 (for the Challenge) |
| 0016 | [Pull-based continuous deployment of CI-approved commits](0016-pull-based-continuous-deployment.md) | Accepted |
| 0017 | [Timed solves, checked automatically](0017-timed-solves.md) | Accepted |
| 0018 | [Consistent Easy, bigger Hard, and a joke level](0018-retuned-levels.md) | Accepted |
| 0019 | [Insane: tracks that cross themselves](0019-insane-crossings.md) | Accepted |
| 0020 | [Crossings are given bridges](0020-crossings-are-given-bridges.md) | Accepted |
| 0021 | [Two kinds of hint, and hints that stay](0021-two-kinds-of-hint.md) | Accepted |
| 0022 | [Insane on 10×10, and a faster solution counter](0022-insane-10x10.md) | Accepted |
| 0023 | [Pace new random puzzles: one per 5 s, or solve the last](0023-paced-random-puzzles.md) | Accepted |
| 0024 | [Bookmarks, and "Try again" that never changes a result](0024-bookmarks-and-try-again.md) | Accepted |
| 0025 | [The daily Challenge, and a leaderboard of its points](0025-challenge-and-leaderboard.md) | Accepted |
