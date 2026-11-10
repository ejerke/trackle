# Proposal: accounts and leaderboards

- Status: **Partly decided.** Sign-in: username + password, no email
  ([ADR 0012](../adr/0012-accounts.md), built). Progress sync and leaderboards:
  still open (questions 2–4).
- Date: 2026-11-10

Everything else on the roadmap is built. Accounts and leaderboards are held
back because they need decisions only the owner can make: how people sign in,
what personal data we hold, and what a leaderboard should reward. This document
lays out the options and a recommendation.

## What accounts are for

1. **Progress on several devices** (phone and laptop share streaks).
2. **Not losing progress** when browser data is cleared.
3. **Leaderboards**, which need some identity to rank.

The client side is already prepared ([client-storage.md](../client-storage.md#path-to-accounts)):
progress sits behind an async `ProgressStore`, and each solved record keeps the
accepted answer so the server can re-verify imported progress.

## Sign-in options

| Option | Personal data held | Effort | Main risk |
| ------ | ------------------ | ------ | --------- |
| **A. Anonymous account + recovery code** | none | low | lose the code = lose the account |
| **B. Passkeys (WebAuthn)** | none (public key only) | medium | device/sync loss; newer tech to learn |
| C. Email magic link | email address | medium | needs an email-sending service; deliverability |
| D. Username + password | password hash | medium | password reuse, resets need email anyway |
| E. "Sign in with Google/GitHub" | provider id, often email | medium | third-party dependency and tracking perception |

**A** works like Wordle-style games: the first visit silently creates an
account; the player can show a recovery code (or QR) to sign in on another
device. **B** can be added on top later as a nicer, more secure "upgrade" for
people who want it.

**Recommendation: A now, B later.** Neither A nor B stores an email address or
password, which keeps privacy obligations (e.g. GDPR) and security risk small,
and no outside services are needed.

## Leaderboards: what should they reward?

| Ranking | Cheat-resistance | Notes |
| ------- | ---------------- | ----- |
| Fastest solve today | **poor** | A player can open the puzzle elsewhere (or run a solver) and then "start" and submit instantly. Timing must be server-side and is still gameable. |
| Longest current streak | fair | Needs daily effort; a solver script could still keep a streak alive. |
| Puzzles solved this month | fair | Same caveat. |
| Friends / private groups (any ranking) | good socially | Cheating among friends is self-limiting; no moderation of strangers' names needed. |

**Recommendation:** start with **private groups** (create a group, share an
invite link, see members' streaks and today's times), and leave the public
global leaderboard out until we see a need. Public rankings bring display-name
moderation and cheating questions that groups mostly avoid.

## Technical sketch (for option A + groups)

Migration `0002_accounts.sql`:

```sql
CREATE TABLE users    (id INTEGER PRIMARY KEY, display_name TEXT NOT NULL,
                       recovery_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL) STRICT;
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                       created_at TEXT NOT NULL, expires_at TEXT NOT NULL) STRICT;
CREATE TABLE solves   (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                       puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
                       started_at TEXT, solved_at TEXT NOT NULL, checks INTEGER NOT NULL,
                       UNIQUE (user_id, puzzle_id)) STRICT;
CREATE TABLE groups   (id INTEGER PRIMARY KEY, name TEXT NOT NULL, invite_hash TEXT NOT NULL UNIQUE, ...) STRICT;
CREATE TABLE group_members (group_id ..., user_id ..., PRIMARY KEY (group_id, user_id)) STRICT;
```

- **Sessions**: random 256-bit token in an `HttpOnly; Secure; SameSite=Lax`
  cookie; only its SHA-256 hash is stored, so a leaked database can't be used to
  log in. Recovery codes are stored hashed the same way.
- **CSRF**: `SameSite=Lax` plus requiring a JSON `Content-Type` on writes (forms
  can't send it cross-site).
- **Solves** are recorded by the server when `/check` succeeds for a signed-in
  player, with server-side `started_at` from the first puzzle fetch, so stats no
  longer depend on the client clock.
- **Import**: on first sign-in, local `list()` is posted to `/api/me/import`; the
  server re-checks each `solvedCells` against the stored solution before
  creating `solves` rows. Only daily puzzles are imported (random ones aren't
  stored server-side).
- **Client**: `RemoteProgressStore` + `SyncedProgressStore` as already planned;
  components don't change.
- **Account deletion**: one endpoint deletes the user (cascades to sessions,
  solves and memberships). Needed for privacy laws and good manners.

Estimated size: about the same as everything since the first commit; it would
come with its own ADR and tests (auth code especially needs them).

## Questions

1. **Sign-in**: go with A (anonymous + recovery code), possibly B later? Or do
   you prefer email, passwords, or Google/GitHub?
2. **Leaderboards**: private groups first, or do you want a public global board?
   If global: rank by streak, by solves, or by time?
3. **Display names**: free text (needs a length limit and maybe a word filter),
   or generated names (e.g. "Swift Locomotive 42") that players can reroll?
4. **Timing**: show solve times at all? They're the most fun and the least
   trustworthy number.
