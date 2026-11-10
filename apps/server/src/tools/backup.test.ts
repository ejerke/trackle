import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { backup } from "./backup.ts";

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("backup", () => {
  it("makes a consistent copy and keeps only the newest backups", async () => {
    dir = mkdtempSync(join(tmpdir(), "trackle-backup-"));
    const source = join(dir, "live.db");
    const db = new Database(source);
    db.exec("CREATE TABLE t (x INTEGER); INSERT INTO t VALUES (42)");

    const backups = join(dir, "backups");
    for (let day = 1; day <= 4; day++) {
      await backup(source, backups, 3, new Date(`2026-11-0${day}T03:00:00Z`));
    }
    db.close();

    const files = readdirSync(backups).sort();
    expect(files).toEqual(["trackle-20261102T030000Z.db", "trackle-20261103T030000Z.db", "trackle-20261104T030000Z.db"]);
    const copy = new Database(join(backups, files[2]!), { readonly: true });
    expect(copy.prepare("SELECT x FROM t").pluck().get()).toBe(42);
    copy.close();
  });
});
