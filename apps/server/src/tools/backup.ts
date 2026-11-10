/**
 * Online SQLite backup: safe while the server is running (uses SQLite's backup
 * API, not a file copy, so the copy is always consistent).
 *
 *   npm run backup                          # from the repo root
 *   BACKUP_DIR=/var/backups/trackle BACKUP_KEEP=30 npm run backup
 *
 * Writes trackle-<UTC timestamp>.db into BACKUP_DIR and deletes the oldest
 * backups beyond BACKUP_KEEP. Run by deploy/deploy.sh before every deploy and
 * daily by deploy/trackle-backup.timer. Restore: see docs/deployment.md.
 */
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { loadConfig } from "../config.ts";

const BACKUP_NAME = /^trackle-\d{8}T\d{6}Z\.db$/;

export async function backup(databasePath: string, backupDir: string, keep: number, now = new Date()): Promise<string> {
  mkdirSync(backupDir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const target = join(backupDir, `trackle-${stamp}.db`);

  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }

  // Keep the newest `keep` backups. Only touches files matching our own naming.
  const old = readdirSync(backupDir)
    .filter((f) => BACKUP_NAME.test(f))
    .sort()
    .reverse()
    .slice(keep);
  for (const file of old) rmSync(join(backupDir, file));
  return target;
}

// Run as a script (not when imported by tests).
if (import.meta.main) {
  const config = loadConfig();
  const dir = process.env.BACKUP_DIR ?? join(config.databasePath, "..", "backups");
  const keep = Number(process.env.BACKUP_KEEP ?? 30);
  const file = await backup(config.databasePath, dir, keep);
  console.log(`Backed up ${config.databasePath} -> ${file}`);
}
