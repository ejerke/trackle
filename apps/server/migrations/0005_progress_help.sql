-- 0005: how much help a player had (ADR 0014). Copied out of record_json like
-- solved_at, so "solved it yourself" is a plain query:
--   solved_at IS NOT NULL AND hints_used = 0 AND revealed_at IS NULL
ALTER TABLE user_progress ADD COLUMN hints_used INTEGER NOT NULL DEFAULT 0 CHECK (hints_used >= 0);
ALTER TABLE user_progress ADD COLUMN revealed_at TEXT;
