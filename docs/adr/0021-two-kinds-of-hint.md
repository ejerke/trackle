# 0021. Two kinds of hint, and hints that stay

- Status: Accepted
- Date: 2026-11-12
- Amends: [0014](0014-hints-and-answers.md)

## Context

A hint that pointed out a mistake ("this segment doesn't belong") was only a
red highlight for a few seconds. Look away, or press Hint again quickly, and
the hint was gone, though it still counted. Hard and Insane only allowed 3.

## Decision

- **Two hints, each with its own limit** (`hintLimit` and `emptyHintLimit`
  in `LEVELS`): Hard and Insane allow 5 of each, Super-duper hard none, Easy
  and Medium unlimited. Requests say which: `{ kind: "track" | "empty" }`.
- **Track hint** reveals one track square with its piece. It prefers a square
  where the player's track is wrong (a wrong segment touches it, or it's marked
  "no track"), then the next square logic completes (`deductionOrder`). The
  response lists the wrong segments in the piece's way (`remove`); the board
  deletes them and lays the piece.
- **No-track hint** reveals one square without track: first one the player
  drew track through; otherwise the most useful unmarked one
  (`mostUsefulEmpty` in `hints.ts`): beside a loose end of the drawn track (A
  and B count), then beside the solution's track, then beside the player's
  track, never one the clues already give away (a 0 line, or a line whose
  track is all drawn), and between equals the one logic rules out sooner
  (`emptyDeductionOrder`). So it reads as chosen, not as reading order. The
  board deletes every segment through it and marks it "no track".
- There is no separate "mistake" hint any more: both kinds fix mistakes by
  revealing the right answer for that square.
- **Revealed squares are locked** (`board.locked`, "r:c" keys): drawn like
  given pieces, can't be edited, and survive Clear. So a hint can't be lost.
- Progress schema v7 adds `emptyHintsUsed`. "Solved on your own" means
  neither kind was used; the account's `hints_used` column holds both kinds.

## Consequences

- Locks live in the board, so like the board they reach the account only on
  Save or a solve. The hint *counts* sync automatically as before.
- Records from v6 clients are refused by the progress API until the page
  reloads (as with every schema bump).
