-- 0004: per-account preferences. NULL = not chosen yet (the site default applies).
-- Validity against the current list of difficulties is checked in code, so
-- adding a level later needs no migration.
ALTER TABLE users ADD COLUMN preferred_difficulty INTEGER CHECK (preferred_difficulty >= 0);
