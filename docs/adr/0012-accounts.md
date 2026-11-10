# 0012. Username + password accounts with cookie sessions

- Status: Accepted
- Date: 2026-11-10
- Decides part of [the accounts proposal](../proposals/accounts-and-leaderboards.md)

## Context

The owner chose the simplest familiar model: **username and password, no
email**. No personal data beyond a chosen username, no email service to run.

## Decision

- **Users**: username 3–20 of `[A-Za-z0-9_]`, unique ignoring case (stored as
  typed, `COLLATE NOCASE`). Password 8–200 characters, no composition rules
  (NIST SP 800-63B: length matters, forced symbols don't).
- **Hashing**: scrypt from `node:crypto` (no dependency), N=2^17, r=8, p=1
  (OWASP minimum), random 16-byte salt, stored as
  `scrypt$N$r$p$salt$hash` so parameters can be raised later. ~300 ms per hash
  on the dev machine, run on libuv's thread pool (doesn't block requests).
  Passwords are NFKC-normalised so equivalent Unicode spellings match.
- **Sessions**: 256-bit random token in an `HttpOnly; SameSite=Lax` cookie
  (`Secure` in production), valid 30 days. Only its SHA-256 is stored, so a
  leaked database can't be used to sign in.
- **CSRF**: `SameSite=Lax`, plus every API write must be
  `Content-Type: application/json` (415 otherwise), which HTML forms can't send.
- **Guessing**: a strict `auth` rate limit (10, then one per 6 s per client) on
  every password check; one generic `invalid_credentials` for "no such user"
  and "wrong password", and the no-such-user path hashes too, so timing doesn't
  tell them apart either.
- **Changing the password** signs out all other sessions. **Deleting the
  account** needs the password and removes the user and sessions (cascade).
- Accounts don't sync progress yet; that's a separate step.

## Alternatives considered

See the proposal: anonymous accounts with recovery codes, passkeys, email
magic links, OAuth. Chosen for simplicity and familiarity.
**bcrypt/argon2** packages: argon2id is the current favourite but needs a
native dependency; scrypt is built in and recommended by OWASP too.

## Consequences

- **No password reset.** Without email there's no way to prove who you are
  after forgetting the password. The sign-up form says so plainly.
- Usernames are visible to whoever we show them to (future leaderboards), and
  "username taken" reveals which names exist. Acceptable for a game.
- Login costs ~300 ms of CPU on a pool thread; the auth rate limit bounds it.
