import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type Db = Database.Database;

/** Open (creating if needed) the database and apply connection settings. Use ":memory:" in tests. */
export function openDatabase(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL"); // readers don't block the writer
  db.pragma("foreign_keys = ON"); // off by default in SQLite, per connection
  db.pragma("busy_timeout = 5000"); // wait for locks instead of failing immediately
  return db;
}
