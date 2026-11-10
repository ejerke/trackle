import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./connection.ts";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** Read NNNN_name.sql files from a directory, sorted by version. */
export function loadMigrations(dir: string): Migration[] {
  const migrations = readdirSync(dir)
    .map((file) => {
      const m = FILE_PATTERN.exec(file);
      if (!m) {
        if (file.endsWith(".sql")) throw new Error(`Badly named migration file: ${file}`);
        return null;
      }
      return { version: Number(m[1]), name: m[2]!, sql: readFileSync(join(dir, file), "utf8") };
    })
    .filter((m): m is Migration => m !== null)
    .sort((a, b) => a.version - b.version);

  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]!.version === migrations[i - 1]!.version) {
      throw new Error(`Duplicate migration version ${migrations[i]!.version}`);
    }
  }
  return migrations;
}

/**
 * Bring the database schema up to date. Each pending migration runs in its own
 * transaction together with its bookkeeping row, so a failure leaves the
 * database at the last good version. Returns the versions that were applied.
 */
export function migrate(db: Db, migrations: Migration[]): number[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").pluck().all() as number[],
  );
  const known = new Set(migrations.map((m) => m.version));
  const unknown = [...applied].filter((v) => !known.has(v));
  if (unknown.length > 0) {
    // The database is newer than this code. Refuse rather than guess.
    throw new Error(`Database has migrations this code doesn't know: ${unknown.join(", ")}`);
  }

  const record = db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)");
  const ran: number[] = [];
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      record.run(m.version, m.name);
    })();
    ran.push(m.version);
  }
  return ran;
}
