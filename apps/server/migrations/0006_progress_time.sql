-- 0006: solves are timed (ADR 0017). record_json moves to PuzzleProgress v6,
-- which adds timeMs; older records get 0 ("not timed"), exactly what the
-- browser's migrateProgress() does with its own copies.
UPDATE user_progress
SET record_json = json_set(record_json, '$.schemaVersion', 6, '$.timeMs', 0)
WHERE json_extract(record_json, '$.schemaVersion') = 5;
