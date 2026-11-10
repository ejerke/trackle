-- 0003: players' progress, synced across devices. See docs/adr/0013-progress-sync.md.
--
-- One row per (user, puzzle). The record is the same JSON the browser keeps
-- (PuzzleProgress in @trackle/shared); updated_at and solved_at are copied out
-- of it so they can be queried and indexed (e.g. by future leaderboards).

CREATE TABLE user_progress (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- puzzleKeyId(): "2026-11-10:1" (daily) or "random:0:k3j9x2ab".
    key_id      TEXT    NOT NULL CHECK (length(key_id) BETWEEN 3 AND 40),
    record_json TEXT    NOT NULL CHECK (json_valid(record_json)),
    updated_at  TEXT    NOT NULL,
    -- Daily solves are only stored after the server re-checked the answer.
    solved_at   TEXT,
    PRIMARY KEY (user_id, key_id)
) STRICT;
