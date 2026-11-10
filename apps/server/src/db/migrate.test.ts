import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./connection.ts";
import { loadMigrations, migrate, type Migration } from "./migrate.ts";

const realMigrations = fileURLToPath(new URL("../../migrations", import.meta.url));

describe("migrations", () => {
  it("applies all real migrations to an empty database, then nothing on the second run", () => {
    const db = openDatabase(":memory:");
    const migrations = loadMigrations(realMigrations);
    expect(migrate(db, migrations)).toEqual(migrations.map((m) => m.version));
    expect(migrate(db, migrations)).toEqual([]);
  });

  it("enforces the puzzles table constraints", () => {
    const db = openDatabase(":memory:");
    migrate(db, loadMigrations(realMigrations));
    const insert = db.prepare(
      `INSERT INTO puzzles (puzzle_date, difficulty, width, height, seed, generator_version, puzzle_json, solution_json)
       VALUES (?, 1, 6, 6, 's', 1, '{}', '[]')`,
    );
    insert.run("2026-11-10");
    expect(() => insert.run("2026-11-10")).toThrow(/UNIQUE/); // one puzzle per day and difficulty
    expect(() => insert.run("2026-02-30")).toThrow(/CHECK/); // not a real date
    expect(() => insert.run("10-11-2026")).toThrow(/CHECK/); // not ISO
  });

  it("rolls back a failing migration completely", () => {
    const db = openDatabase(":memory:");
    const migrations: Migration[] = [
      { version: 1, name: "ok", sql: "CREATE TABLE a (x INTEGER)" },
      { version: 2, name: "broken", sql: "CREATE TABLE b (x INTEGER); THIS IS NOT SQL" },
    ];
    expect(() => migrate(db, migrations)).toThrow();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all();
    expect(tables).toContain("a");
    expect(tables).not.toContain("b");
    expect(db.prepare("SELECT version FROM schema_migrations").pluck().all()).toEqual([1]);
  });

  it("refuses to run against a database newer than the code", () => {
    const db = openDatabase(":memory:");
    migrate(db, [
      { version: 1, name: "a", sql: "CREATE TABLE a (x INTEGER)" },
      { version: 2, name: "b", sql: "CREATE TABLE b (x INTEGER)" },
    ]);
    expect(() => migrate(db, [{ version: 1, name: "a", sql: "" }])).toThrow(/doesn't know: 2/);
  });
});
