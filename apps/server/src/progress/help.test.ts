import { fileURLToPath } from "node:url";
import { LEVELS, emptyGrid, emptyProgress, mergeSummary, type PuzzleProgress } from "@trackle/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE } from "../auth/routes.ts";
import { openDatabase, type Db } from "../db/connection.ts";
import { loadMigrations, migrate } from "../db/migrate.ts";
import { PuzzleRepository } from "../puzzles/repository.ts";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));
let app: FastifyInstance;
let db: Db;

async function setup() {
  db = openDatabase(":memory:");
  migrate(db, loadMigrations(migrationsDir));
  app = await buildApp({ db, now: () => new Date("2026-11-10T12:00:00Z"), passwordParams: { N: 2 ** 10, r: 8, p: 1 } });
  await app.inject("/api/puzzles/today?difficulty=0");
}
afterEach(async () => {
  await app?.close();
  db?.close();
});

const stored = () => new PuzzleRepository(db).find("2026-11-10", 0)!;
/** The board as a client sends it with nothing drawn: just the A/B stubs and hints. */
function blank(): number[][] {
  const { puzzle } = stored();
  const cells = emptyGrid(puzzle.width, puzzle.height);
  for (const ep of puzzle.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
  for (const h of puzzle.hints) cells[h.row]![h.col] = h.piece;
  return cells;
}
async function signUp(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { username: "alice", password: "correct horse" } });
  return [res.headers["set-cookie"]].flat()[0]!.split(";")[0]!.split("=")[1]!;
}
const call = (path: string, payload: object, token?: string) =>
  app.inject({ method: "POST", url: path, payload, headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
const help = () => db.prepare("SELECT hints_used, revealed_at FROM user_progress").get() as { hints_used: number; revealed_at: string | null } | undefined;

describe("hints and answers", () => {
  it("gives a correct piece as a hint, also to anonymous players (nothing recorded)", async () => {
    await setup();
    const res = await call("/api/puzzles/2026-11-10/hint?difficulty=0", { cells: blank() });
    expect(res.statusCode).toBe(200);
    const hint = res.json();
    expect(hint.kind).toBe("piece");
    expect(hint.piece).toBe(stored().solution[hint.row][hint.col]);
    expect(help()).toBeUndefined();
  });

  it("counts hints on the account of a signed-in player", async () => {
    await setup();
    const token = await signUp();
    await call("/api/puzzles/2026-11-10/hint?difficulty=0", { cells: blank() }, token);
    await call("/api/puzzles/2026-11-10/hint?difficulty=0", { cells: blank() }, token);
    expect(help()).toEqual({ hints_used: 2, revealed_at: null });
    // "complete" isn't help: send the solution itself.
    await call("/api/puzzles/2026-11-10/hint?difficulty=0", { cells: stored().solution }, token);
    expect(help()!.hints_used).toBe(2);
  });

  it("shows the answer and records it; a later solve doesn't count", async () => {
    await setup();
    const token = await signUp();
    const res = await call("/api/puzzles/2026-11-10/answer?difficulty=0", {}, token);
    expect(res.json()).toEqual({ cells: stored().solution });
    expect(help()!.revealed_at).toBe("2026-11-10T12:00:00.000Z");

    const lateSolve: PuzzleProgress = {
      ...emptyProgress({ kind: "daily", date: "2026-11-10", difficulty: 0 }, "fp", new Date("2026-11-10T08:00:00Z")),
      solvedAt: "2026-11-10T12:05:00.000Z",
      solvedCells: stored().solution,
      checks: 1,
    };
    const synced = await app.inject({
      method: "PUT",
      url: "/api/me/progress",
      payload: { records: [lateSolve] },
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(synced.json().records[0]).toMatchObject({ solvedAt: null, revealedAt: "2026-11-10T12:00:00.000Z" });
  });

  it("works for random puzzles, and 404s for days that don't exist", async () => {
    await setup();
    expect((await call("/api/random/0/abcd1234/answer", {})).json().cells).toHaveLength(6);
    expect((await call("/api/puzzles/2026-11-09/hint?difficulty=0", { cells: [[0]] })).statusCode).toBe(404);
    expect((await call("/api/puzzles/2026-11-09/answer?difficulty=0", {})).statusCode).toBe(404);
  });
});

describe("hint limits", () => {
  it("allows Hard's hint limit for a signed-in player, then refuses", async () => {
    await setup();
    const token = await signUp();
    await app.inject("/api/puzzles/today?difficulty=2");
    const hard = new PuzzleRepository(db).find("2026-11-10", 2)!.puzzle;
    const cells = emptyGrid(hard.width, hard.height);
    for (const ep of hard.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
    for (const h of hard.hints) cells[h.row]![h.col] = h.piece;

    const ask = () => call("/api/puzzles/2026-11-10/hint?difficulty=2", { cells }, token);
    const limit = LEVELS[2]!.hintLimit!;
    for (let i = 0; i < limit; i++) expect((await ask()).statusCode).toBe(200);
    const over = await ask();
    expect(over.statusCode).toBe(403);
    expect(over.json()).toEqual({ error: "hint_limit" });
    expect(db.prepare("SELECT hints_used FROM user_progress WHERE key_id = '2026-11-10:2'").pluck().get()).toBe(limit);
  });

  it("counts 'no track' hints against their own limit", async () => {
    await setup();
    const token = await signUp();
    await app.inject("/api/puzzles/today?difficulty=2");
    const hard = new PuzzleRepository(db).find("2026-11-10", 2)!.puzzle;
    const cells = emptyGrid(hard.width, hard.height);
    for (const ep of hard.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
    for (const h of hard.hints) cells[h.row]![h.col] = h.piece;

    const ask = (kind: "track" | "empty") => call("/api/puzzles/2026-11-10/hint?difficulty=2", { kind, cells }, token);
    const limit = LEVELS[2]!.emptyHintLimit!;
    for (let i = 0; i < limit; i++) {
      const res = await ask("empty");
      expect(res.statusCode).toBe(200);
      expect(res.json().kind).toBe("empty");
    }
    expect((await ask("empty")).statusCode).toBe(403);
    // Track hints are still there, and the account counts both kinds.
    expect((await ask("track")).json().kind).toBe("piece");
    const record = JSON.parse(db.prepare("SELECT record_json FROM user_progress WHERE key_id = '2026-11-10:2'").pluck().get() as string);
    expect(record).toMatchObject({ hintsUsed: 1, emptyHintsUsed: limit });
    expect(db.prepare("SELECT hints_used FROM user_progress WHERE key_id = '2026-11-10:2'").pluck().get()).toBe(limit + 1);
  });

  it("gives new hints on a finished puzzle (Try again) without counting them", async () => {
    await setup();
    const token = await signUp();
    await app.inject("/api/puzzles/today?difficulty=2");
    const { puzzle: hard, solution } = new PuzzleRepository(db).find("2026-11-10", 2)!;
    const cells = emptyGrid(hard.width, hard.height);
    for (const ep of hard.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
    for (const h of hard.hints) cells[h.row]![h.col] = h.piece;
    const ask = () => call("/api/puzzles/2026-11-10/hint?difficulty=2", { cells }, token);
    const limit = LEVELS[2]!.hintLimit!;
    for (let i = 0; i < limit; i++) await ask();
    expect((await ask()).statusCode).toBe(403);

    // Solve it (with all those hints), then play it again.
    const key = { kind: "daily", date: "2026-11-10", difficulty: 2 } as const;
    const solved = { ...emptyProgress(key, "fp", new Date("2026-11-10T08:00:00Z")), hintsUsed: limit, checks: 1, solvedAt: "2026-11-10T12:00:00.000Z", solvedCells: solution };
    const sync = await app.inject({ method: "PUT", url: "/api/me/progress", payload: { records: [solved] }, headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect(sync.json().records[0].solvedAt).not.toBeNull();
    expect((await ask()).statusCode).toBe(200);
    // The account still says: solved with exactly `limit` hints.
    const record = JSON.parse(db.prepare("SELECT record_json FROM user_progress WHERE key_id = '2026-11-10:2'").pluck().get() as string);
    expect(record).toMatchObject({ hintsUsed: limit, solvedAt: "2026-11-10T12:00:00.000Z", replay: null });
  });

  it("gives no hints at all on Super-duper hard", async () => {
    await setup();
    const token = await signUp();
    await app.inject("/api/puzzles/today?difficulty=3");
    const puzzle = new PuzzleRepository(db).find("2026-11-10", 3)!.puzzle;
    const cells = emptyGrid(puzzle.width, puzzle.height);
    const first = await call("/api/puzzles/2026-11-10/hint?difficulty=3", { cells }, token);
    expect(first.statusCode).toBe(403);
    expect(first.json()).toEqual({ error: "hint_limit" });
  });

  it("doesn't limit Medium", async () => {
    await setup();
    const token = await signUp();
    await app.inject("/api/puzzles/today?difficulty=1");
    const medium = new PuzzleRepository(db).find("2026-11-10", 1)!.puzzle;
    const cells = emptyGrid(medium.width, medium.height);
    for (const ep of medium.endpoints) cells[ep.row]![ep.col]! |= ep.dir;
    for (let i = 0; i < 7; i++) {
      expect((await call("/api/puzzles/2026-11-10/hint?difficulty=1", { cells }, token)).statusCode).toBe(200);
    }
  });
});

describe("answers per level", () => {
  it("never shows Hard answers, signed in or not, daily or random", async () => {
    await setup();
    await app.inject("/api/puzzles/today?difficulty=2");
    const daily = await call("/api/puzzles/2026-11-10/answer?difficulty=2", {});
    expect(daily.statusCode).toBe(403);
    expect(daily.json()).toEqual({ error: "answer_unavailable" });
    const token = await signUp();
    expect((await call("/api/random/2/abcd1234/answer", {}, token)).statusCode).toBe(403);
    expect(db.prepare("SELECT COUNT(*) FROM user_progress").pluck().get()).toBe(0); // nothing recorded
    expect((await call("/api/random/1/abcd1234/answer", {})).statusCode).toBe(200); // Medium still can
  });
});

describe("help can't be undone by syncing", () => {
  const key = { kind: "daily", date: "2026-11-10", difficulty: 0 } as const;
  const rec = (over: Partial<PuzzleProgress>): PuzzleProgress => ({ ...emptyProgress(key, "fp", new Date("2026-11-10T08:00:00Z")), ...over });

  it("keeps the highest hint count and the earliest shown answer", () => {
    const merged = mergeSummary(rec({ hintsUsed: 3, revealedAt: "2026-11-10T10:00:00.000Z" }), rec({ hintsUsed: 1, revealedAt: null }));
    expect(merged).toMatchObject({ hintsUsed: 3, revealedAt: "2026-11-10T10:00:00.000Z" });
  });

  it("still accepts a solve made before the answer was shown", () => {
    const existing = rec({ revealedAt: "2026-11-10T10:00:00.000Z" });
    const earlier = rec({ solvedAt: "2026-11-10T09:00:00.000Z", solvedCells: [[1]] });
    expect(mergeSummary(existing, earlier).solvedAt).toBe("2026-11-10T09:00:00.000Z");
  });
});
