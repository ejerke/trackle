-- 0002: user accounts (username + password, no email) and login sessions.
-- See docs/adr/0012-accounts.md.

CREATE TABLE users (
    id                  INTEGER PRIMARY KEY,
    -- Shown as typed; uniqueness and lookups ignore case ("Alice" = "alice").
    username            TEXT    NOT NULL UNIQUE COLLATE NOCASE
                                CHECK (length(username) BETWEEN 3 AND 20),
    -- "scrypt$N$r$p$salt$hash" (base64url). Never the password itself.
    password_hash       TEXT    NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    password_changed_at TEXT
) STRICT;

CREATE TABLE sessions (
    -- SHA-256 of the cookie token: a leaked database can't be used to log in.
    token_hash  TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL,
    expires_at  TEXT    NOT NULL
) STRICT;

-- "Sign out everywhere" and account deletion look sessions up by user.
CREATE INDEX sessions_by_user ON sessions (user_id);
