import { fileURLToPath } from "node:url";
import { emptyProgress, type PuzzleKey, type PuzzleProgress } from "@trackle/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE } from "../auth/routes.ts";
import { openDatabase, type Db } from "../db/connection.ts";
import { loadMigrations, migrate } from "../db/migrate.ts";
import { PuzzleRepository } from "../puzzles/repository.ts";
import { mergeSummary, saveBoard } from "@trackle/shared";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));
const NOW = new Date("2026-11-10T12:00:00Z");
let app: FastifyInstance;
let db: Db;

async function setup() {
  db = openDatabase(":memory:");
  migrate(db, loadMigrations(migrationsDir));
  app = await buildApp({ db, now: () => NOW, passwordParams: { N: 2 ** 10, r: 8, p: 1 } });
}
afterEach(async () => {
  await app?.close();
  db?.close();
});

async function signIn(username: string, register = true): Promise<string> {
  const url = register ? "/api/auth/register" : "/api/auth/login";
  const res = await app.inject({ method: "POST", url, payload: { username, password: "correct horse" } });
  return [res.headers["set-cookie"]].flat()[0]!.split(";")[0]!.split("=")[1]!;
}
const auth = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });
const sync = (token: string, records: PuzzleProgress[]) =>
  app.inject({ method: "PUT", url: "/api/me/progress", headers: auth(token), payload: { records } });
const save = (token: string, record: PuzzleProgress) =>
  app.inject({ method: "PUT", url: "/api/me/progress/board", headers: auth(token), payload: { record } });
const list = async (token: string) =>
  (await app.inject({ url: "/api/me/progress", headers: auth(token) })).json().records as PuzzleProgress[];

const daily: PuzzleKey = { kind: "daily", date: "2026-11-10", difficulty: 0 };
const drawn = (edges: string[], extra: Partial<PuzzleProgress> = {}): PuzzleProgress => ({
  ...emptyProgress(daily, "fp", new Date("2026-11-10T08:00:00Z")),
  updatedAt: "2026-11-10T09:00:00.000Z",
  board: { edges, marks: {} },
  boardDirty: true,
  ...extra,
});
async function easySolution(): Promise<number[][]> {
  await app.inject("/api/puzzles/today?difficulty=0");
  return new PuzzleRepository(db).find("2026-11-10", 0)!.solution;
}

describe("progress sync API", () => {
  it("requires a signed-in player", async () => {
    await setup();
    expect((await app.inject("/api/me/progress")).statusCode).toBe(401);
    const res = await app.inject({ method: "PUT", url: "/api/me/progress/board", payload: { record: drawn([]) } });
    expect(res.json()).toEqual({ error: "unauthorized" });
  });

  it("syncs account-level facts automatically, but never an unfinished board", async () => {
    await setup();
    const token = await signIn("alice");
    const stored = (await sync(token, [drawn(["h:0:0", "h:0:1"], { checks: 2 })])).json().records[0];
    expect(stored.checks).toBe(2);
    expect(stored.board).toEqual({ edges: [], marks: {} });
    expect(stored.boardSavedAt).toBeNull();
    expect(JSON.stringify(db.prepare("SELECT record_json FROM user_progress").pluck().get())).not.toContain("h:0:1");
  });

  it("stores the board on Save, for other devices to continue", async () => {
    await setup();
    const phone = await signIn("alice");
    const saved = (await save(phone, drawn(["h:0:0", "h:0:1"]))).json().record;
    expect(saved.board.edges).toEqual(["h:0:0", "h:0:1"]);
    expect(saved.boardSavedAt).toBe(NOW.toISOString());
    expect(saved.boardDirty).toBe(false);

    const laptop = await signIn("alice", false);
    expect((await list(laptop))[0]!.board.edges).toEqual(["h:0:0", "h:0:1"]);

    // A later automatic sync from a device with other unsaved edits leaves the saved board alone.
    await sync(laptop, [drawn(["v:3:3"], { checks: 1 })]);
    expect((await list(phone))[0]!.board.edges).toEqual(["h:0:0", "h:0:1"]);
  });

  it("keeps solves (with the finished track) automatically, and nothing undoes them", async () => {
    await setup();
    const token = await signIn("alice");
    const cells = await easySolution();
    const solved = drawn(["h:0:0"], { solvedAt: "2026-11-10T10:00:00.000Z", solvedCells: cells, checks: 1 });
    const stored = (await sync(token, [solved])).json().records[0];
    expect(stored.solvedAt).toBe("2026-11-10T10:00:00.000Z");
    expect(stored.board.edges).toEqual(["h:0:0"]); // the finished track

    await sync(token, [drawn([], { updatedAt: "2026-11-10T11:00:00.000Z" })]); // a device that never saw the solve
    const afterSave = (await save(token, drawn(["v:1:1"]))).json().record; // and tries to save over it
    expect(afterSave.solvedAt).toBe("2026-11-10T10:00:00.000Z");
    expect(afterSave.board.edges).toEqual(["h:0:0"]);
  });

  it("re-checks daily solves against the stored puzzle and drops fake ones", async () => {
    await setup();
    const token = await signIn("alice");
    await easySolution();
    const fake = drawn([], { solvedAt: "2026-11-10T10:00:00.000Z", solvedCells: [[0, 0], [0, 0]] });
    const stored = (await sync(token, [fake])).json().records[0];
    expect(stored.solvedAt).toBeNull();
    expect(stored.solvedCells).toBeNull();
  });

  it("keeps each player's progress private", async () => {
    await setup();
    const alice = await signIn("alice");
    const bob = await signIn("bob");
    await save(alice, drawn(["h:0:0"]));
    expect(await list(bob)).toEqual([]);
  });

  it("deletes one record, and everything when the account is deleted", async () => {
    await setup();
    const token = await signIn("alice");
    const random: PuzzleKey = { kind: "random", seed: "abcd1234", difficulty: 1 };
    await sync(token, [drawn([]), { ...drawn([]), key: random }]);
    const del = await app.inject({ method: "DELETE", url: `/api/me/progress/${encodeURIComponent("random:1:abcd1234")}`, headers: auth(token), payload: {} });
    expect(del.statusCode).toBe(204);
    expect((await list(token)).map((r) => r.key.kind)).toEqual(["daily"]);

    await app.inject({ method: "POST", url: "/api/auth/delete-account", headers: auth(token), payload: { password: "correct horse" } });
    expect(db.prepare("SELECT COUNT(*) FROM user_progress").pluck().get()).toBe(0);
  });

  it("rejects malformed or oversized records", async () => {
    await setup();
    const token = await signIn("alice");
    const ok = drawn([]);
    const bad: unknown[] = [
      { ...ok, key: { kind: "daily", date: "2026-02-30", difficulty: 0 } },
      { ...ok, key: { kind: "random", seed: "NOT OK", difficulty: 0 } },
      { ...ok, key: { kind: "daily", date: "2026-11-10", difficulty: 9 } },
      { ...ok, updatedAt: "yesterday" },
      { ...ok, board: { edges: Array(801).fill("h:0:0"), marks: {} } },
      { ...ok, schemaVersion: 3 }, // old format: clients upgrade before sending
    ];
    for (const r of bad) {
      expect((await sync(token, [r as PuzzleProgress])).statusCode, JSON.stringify(r).slice(0, 80)).toBe(400);
      expect((await save(token, r as PuzzleProgress)).statusCode).toBe(400);
    }
    expect((await sync(token, Array(201).fill(ok))).statusCode).toBe(400);
    expect(await list(token)).toEqual([]);
  });
});

describe("merge rules", () => {
  const base = (over: Partial<PuzzleProgress> = {}): PuzzleProgress => ({ ...emptyProgress(daily, "fp"), ...over });

  it("mergeSummary takes the max checks, the earliest start, and keeps the saved board", () => {
    const existing = base({ checks: 3, startedAt: "2026-11-10T08:00:00.000Z", board: { edges: ["h:0:0"], marks: {} }, boardSavedAt: "2026-11-10T09:00:00.000Z" });
    const incoming = base({ checks: 1, startedAt: "2026-11-10T07:00:00.000Z", board: { edges: ["v:2:2"], marks: {} } });
    const merged = mergeSummary(existing, incoming);
    expect(merged).toMatchObject({ checks: 3, startedAt: "2026-11-10T07:00:00.000Z", boardSavedAt: "2026-11-10T09:00:00.000Z" });
    expect(merged.board.edges).toEqual(["h:0:0"]);
  });

  it("saveBoard replaces the board and stamps the server's time", () => {
    const saved = saveBoard(null, base({ board: { edges: ["h:0:0"], marks: {} }, boardDirty: true }), NOW);
    expect(saved).toMatchObject({ boardSavedAt: NOW.toISOString(), boardDirty: false });
    expect(saved.board.edges).toEqual(["h:0:0"]);
  });
});
