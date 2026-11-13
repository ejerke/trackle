-- 0007: bookmarks and "Try again" (ADR 0024). record_json moves to
-- PuzzleProgress v8, which adds `bookmark` (synced) and `replay` (device-local,
-- so always null here), exactly what the browser's migrateProgress() does.
UPDATE user_progress
SET record_json = json_set(record_json, '$.schemaVersion', 8, '$.bookmark', json('null'), '$.replay', json('null'))
WHERE json_extract(record_json, '$.schemaVersion') = 7;
