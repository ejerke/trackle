-- 0010: signed solve receipts (ADR 0025).
--
-- server_secrets holds keys the server signs with. The receipt key is made
-- here, once, from SQLite's random source, so it survives restarts and is in
-- every backup. A new database gets a new key: receipts from another database
-- don't verify there (they then count as "no receipt", nothing worse).
CREATE TABLE server_secrets (
    name  TEXT PRIMARY KEY,
    value TEXT NOT NULL CHECK (length(value) >= 32)
) STRICT;

INSERT INTO server_secrets (name, value) VALUES ('solve_receipt', lower(hex(randomblob(32))));

-- record_json moves to PuzzleProgress v9, which adds `solveReceipt`; stored
-- solves have none, exactly what the browser's migrateProgress() does.
UPDATE user_progress
SET record_json = json_set(record_json, '$.schemaVersion', 9, '$.solveReceipt', json('null'))
WHERE json_extract(record_json, '$.schemaVersion') = 8;
