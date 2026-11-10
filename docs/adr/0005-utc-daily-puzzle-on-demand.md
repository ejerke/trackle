# 0005. Daily puzzle by UTC date, generated on first request

- Status: Accepted
- Date: 2026-11-10

## Context

Everyone should share one puzzle per day, and a player should always get a
puzzle, whatever their time zone. Players' clocks and time zones vary.

## Decision

- "Today" is the **UTC** date, decided by the **server**. The client never sends
  its own date for the daily puzzle; it calls `/api/puzzles/today`.
- A player whose local date is ahead of UTC gets the UTC day's puzzle, and after
  solving sees a countdown to the next one (`nextPuzzleAt`, next UTC midnight).
- Puzzles are created lazily: the first request for today generates and stores
  it. Days with no visitors never get a puzzle.
- Missing past dates and future dates return 404. Existing past puzzles are
  reachable at `/YYYY-MM-DD` but not linked from the UI yet.
- Generation is seeded from the date, and the insert uses
  `ON CONFLICT DO NOTHING` + read-back, so concurrent first requests agree.
- URLs and storage use ISO `YYYY-MM-DD`.

## Alternatives considered

- **Player's local date**: everyone would see different "today"s and could jump
  ahead by changing time zone.
- **Pre-generating with a cron job**: an extra moving part, and the first
  request costs only milliseconds anyway.

## Consequences

- The archive has gaps for days nobody visited. Acceptable for now; generating
  missing past days on request would be a one-line policy change.
- The puzzle changes at UTC midnight, which is mid-day in some time zones.
