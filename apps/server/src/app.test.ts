import { fileURLToPath } from "node:url";
import { DEFAULT_DIFFICULTY, type PuzzleResponse, type RandomPuzzleResponse } from "@trackle/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { openDatabase, type Db } from "./db/connection.ts";
import { loadMigrations, migrate } from "./db/migrate.ts";
import { generatePuzzle } from "./puzzles/generator.ts";
import { PuzzleRepository } from "./puzzles/repository.ts";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

let app: FastifyInstance;
let db: Db;
let now = new Date("2026-11-10T12:00:00Z");

async function setup() {
  db = openDatabase(":memory:");
  migrate(db, loadMigrations(migrationsDir));
  // Pacing of new random puzzles has its own tests (see "rate limiting").
  app = await buildApp({ db, now: () => now, rateLimit: { policies: { newRandom: { intervalSeconds: 0 } } }, randomAnswerDelayMs: 0 });
}

afterEach(async () => {
  await app?.close();
  db?.close();
  now = new Date("2026-11-10T12:00:00Z");
});

const solutionFor = (date: string, difficulty = DEFAULT_DIFFICULTY) =>
  new PuzzleRepository(db).find(date, difficulty)!.solution;

describe("GET /api/puzzles/today", () => {
  it("creates today's puzzle once and returns the same one afterwards", async () => {
    await setup();
    const first = await app.inject("/api/puzzles/today");
    expect(first.statusCode).toBe(200);
    const body = first.json<PuzzleResponse>();
    expect(body.puzzle.date).toBe("2026-11-10");
    expect(body.puzzle.width).toBe(6);
    expect(body.nextPuzzleAt).toBe("2026-11-11T00:00:00.000Z");

    const second = await app.inject("/api/puzzles/today");
    expect(second.json()).toEqual(body);
    expect(db.prepare("SELECT COUNT(*) FROM puzzles").pluck().get()).toBe(1);
  });

  it("never includes the solution", async () => {
    await setup();
    const res = await app.inject("/api/puzzles/today");
    expect(res.body).not.toMatch(/solution/i);
    expect(Object.keys(res.json<PuzzleResponse>().puzzle).sort()).toEqual(
      ["colClues", "date", "difficulty", "endpoints", "height", "hints", "rowClues", "width"].sort(),
    );
  });

  it("follows UTC: just before midnight UTC is still the same day everywhere", async () => {
    now = new Date("2026-11-10T23:59:00Z");
    await setup();
    expect((await app.inject("/api/puzzles/today")).json<PuzzleResponse>().puzzle.date).toBe("2026-11-10");
  });
});

describe("GET /api/puzzles/:date", () => {
  it("returns an existing past puzzle", async () => {
    now = new Date("2026-11-09T08:00:00Z");
    await setup();
    await app.inject("/api/puzzles/today");
    now = new Date("2026-11-10T08:00:00Z");
    const res = await app.inject("/api/puzzles/2026-11-09");
    expect(res.statusCode).toBe(200);
    expect(res.json<PuzzleResponse>().puzzle.date).toBe("2026-11-09");
  });

  it("creates today's puzzle when requested by date", async () => {
    await setup();
    expect((await app.inject("/api/puzzles/2026-11-10")).statusCode).toBe(200);
  });

  it("refuses past days that were never played, and future days", async () => {
    await setup();
    expect((await app.inject("/api/puzzles/2026-11-09")).json()).toEqual({ error: "not_found" });
    expect((await app.inject("/api/puzzles/2026-11-11")).statusCode).toBe(404);
    expect(db.prepare("SELECT COUNT(*) FROM puzzles").pluck().get()).toBe(0);
  });

  it("rejects malformed dates", async () => {
    await setup();
    for (const bad of ["10-11-2026", "2026-02-30", "today2", "2026-1-1"]) {
      const res = await app.inject(`/api/puzzles/${bad}`);
      expect(res.statusCode, bad).toBe(400);
    }
  });
});

describe("POST /api/puzzles/:date/check", () => {
  const check = (date: string, payload: unknown) =>
    app.inject({ method: "POST", url: `/api/puzzles/${date}/check`, payload: payload as object });

  it("accepts the correct track", async () => {
    await setup();
    await app.inject("/api/puzzles/today");
    const res = await check("2026-11-10", { cells: solutionFor("2026-11-10") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ correct: true });
  });

  it("rejects a wrong track without saying why", async () => {
    await setup();
    await app.inject("/api/puzzles/today");
    const cells = solutionFor("2026-11-10").map((row) => row.map(() => 0));
    expect((await check("2026-11-10", { cells })).json()).toEqual({ correct: false });
  });

  it("validates the request body", async () => {
    await setup();
    await app.inject("/api/puzzles/today");
    expect((await check("2026-11-10", {})).json()).toEqual({ error: "invalid_body" });
    expect((await check("2026-11-10", { cells: [[16]] })).statusCode).toBe(400);
    expect((await check("2026-11-10", { cells: "nope" })).statusCode).toBe(400);
    // Right types, wrong size: valid JSON, just not a correct track.
    expect((await check("2026-11-10", { cells: [[0]] })).json()).toEqual({ correct: false });
  });

  it("does not create puzzles: checking an unplayed day is a 404", async () => {
    await setup();
    expect((await check("2026-11-10", { cells: [[0]] })).statusCode).toBe(404);
  });
});

describe("other routes", () => {
  it("has a health check and JSON 404s for unknown API routes", async () => {
    await setup();
    expect((await app.inject("/api/health")).json()).toEqual({ ok: true });
    expect((await app.inject("/api/nope")).statusCode).toBe(404);
  });
});

describe("lab routes (development only)", () => {
  it("are off unless explicitly enabled", async () => {
    await setup();
    expect((await app.inject("/api/lab/1/lab-0")).statusCode).toBe(404);
  });

  it("generate any difficulty and seed without storing, and check by regenerating", async () => {
    db = openDatabase(":memory:");
    migrate(db, loadMigrations(migrationsDir));
    app = await buildApp({ db, now: () => now, enableLab: true });

    const res = await app.inject("/api/lab/0/some-seed");
    expect(res.statusCode).toBe(200);
    expect(res.json().metrics.tier).not.toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) FROM puzzles").pluck().get()).toBe(0);

    const { solution } = generatePuzzle({ difficulty: 0, seed: "some-seed" });
    const check = await app.inject({ method: "POST", url: "/api/lab/0/some-seed/check", payload: { cells: solution } });
    expect(check.json()).toEqual({ correct: true });
    expect((await app.inject("/api/lab/99/x")).statusCode).toBe(404); // unknown difficulty
  });
});

describe("difficulties", () => {
  it("serves Medium by default and a separate puzzle per difficulty", async () => {
    await setup();
    const medium = (await app.inject("/api/puzzles/today")).json<PuzzleResponse>().puzzle;
    const easy = (await app.inject("/api/puzzles/today?difficulty=0")).json<PuzzleResponse>().puzzle;
    expect(medium.difficulty).toBe(1);
    expect(easy.difficulty).toBe(0);
    expect(easy).not.toEqual(medium);
    expect(db.prepare("SELECT COUNT(*) FROM puzzles").pluck().get()).toBe(2);
    expect((await app.inject("/api/puzzles/2026-11-10?difficulty=0")).json<PuzzleResponse>().puzzle).toEqual(easy);
  });

  it("checks against the puzzle of the requested difficulty", async () => {
    await setup();
    await app.inject("/api/puzzles/today?difficulty=0");
    const cells = solutionFor("2026-11-10", 0);
    const url = "/api/puzzles/2026-11-10/check";
    expect((await app.inject({ method: "POST", url: `${url}?difficulty=0`, payload: { cells } })).json()).toEqual({ correct: true });
    // Medium for that day was never generated, and checking doesn't create it.
    expect((await app.inject({ method: "POST", url, payload: { cells } })).statusCode).toBe(404);
  });

  it("rejects unknown difficulties", async () => {
    await setup();
    for (const d of ["7", "-1", "1.5", "easy", ""]) {
      const res = await app.inject(`/api/puzzles/today?difficulty=${d}`);
      expect(res.statusCode, d).toBe(400);
      expect(res.json()).toEqual({ error: "invalid_difficulty" });
    }
  });
});

describe("random puzzles", () => {
  it("are deterministic per difficulty and seed, and never stored", async () => {
    await setup();
    const a = await app.inject("/api/random/0/abc123");
    expect(a.statusCode).toBe(200);
    const body = a.json<RandomPuzzleResponse>();
    expect(body.seed).toBe("abc123");
    expect(body.puzzle.difficulty).toBe(0);
    expect(a.body).not.toMatch(/solution/i);
    expect((await app.inject("/api/random/0/abc123")).json()).toEqual(body);
    const other = await app.inject("/api/random/0/xyz789");
    expect(other.statusCode).toBe(200);
    expect(other.json<RandomPuzzleResponse>().puzzle).not.toEqual(body.puzzle);
    expect(db.prepare("SELECT COUNT(*) FROM puzzles").pluck().get()).toBe(0);
  });

  it("never reproduce a daily puzzle", async () => {
    await setup();
    const daily = (await app.inject("/api/puzzles/today?difficulty=0")).json<PuzzleResponse>().puzzle;
    const { date: _date, ...dailyLayout } = daily;
    const randomOne = (await app.inject("/api/random/0/abcd")).json<RandomPuzzleResponse>().puzzle;
    expect(randomOne).not.toEqual(dailyLayout);
  });

  it("checks a track by regenerating the puzzle", async () => {
    await setup();
    const { generatePuzzle } = await import("./puzzles/generator.ts");
    const { solution } = generatePuzzle({ difficulty: 0, seed: "random:abc123" });
    const check = (cells: number[][]) =>
      app.inject({ method: "POST", url: "/api/random/0/abc123/check", payload: { cells } });
    expect((await check(solution)).json()).toEqual({ correct: true });
    expect((await check(solution.map((r) => r.map(() => 0)))).json()).toEqual({ correct: false });
  });

  it("validates difficulty and seed", async () => {
    await setup();
    expect((await app.inject("/api/random/9/abcd")).json()).toEqual({ error: "invalid_difficulty" });
    for (const seed of ["abc", "ABCD", "a-b-c-d", "x".repeat(17)]) {
      expect((await app.inject(`/api/random/1/${seed}`)).json(), seed).toEqual({ error: "invalid_seed" });
    }
  });
});

describe("rate limiting", () => {
  async function setupWith(rateLimit: Parameters<typeof buildApp>[0]["rateLimit"]) {
    db = openDatabase(":memory:");
    migrate(db, loadMigrations(migrationsDir));
    app = await buildApp({ db, now: () => now, rateLimit });
  }
  const from = (ip: string, url: string) =>
    app.inject({ url, remoteAddress: "127.0.0.1", headers: { "cf-connecting-ip": ip } });

  it("limits all API requests per client and says when to retry", async () => {
    await setupWith({ policies: { api: { capacity: 3, refillPerSecond: 0.1 } } });
    for (let i = 0; i < 3; i++) expect((await app.inject("/api/health")).statusCode).toBe(200);
    const limited = await app.inject("/api/health");
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "rate_limited" });
    expect(limited.headers["retry-after"]).toBe("10");
  });

  it("charges random-puzzle generation, but not cache hits", async () => {
    await setupWith({ policies: { generation: { capacity: 2, refillPerSecond: 0.01 }, newRandom: { intervalSeconds: 0 } } });
    expect((await app.inject("/api/random/0/aaaa")).statusCode).toBe(200);
    expect((await app.inject("/api/random/0/bbbb")).statusCode).toBe(200);
    // Same puzzles again (and checking them) are cached: free.
    expect((await app.inject("/api/random/0/aaaa")).statusCode).toBe(200);
    const check = await app.inject({ method: "POST", url: "/api/random/0/bbbb/check", payload: { cells: [[0]] } });
    expect(check.statusCode).toBe(200);
    // A third *new* puzzle needs generating: denied.
    expect((await app.inject("/api/random/0/cccc")).statusCode).toBe(429);
    // Daily puzzles are not affected by the generation limit.
    expect((await app.inject("/api/puzzles/today?difficulty=0")).statusCode).toBe(200);
  });

  describe("new random puzzles", () => {
    let ms = 0;
    const setupPaced = async () => {
      ms = 0;
      db = openDatabase(":memory:");
      migrate(db, loadMigrations(migrationsDir));
      app = await buildApp({ db, now: () => now, rateLimit: { now: () => ms }, randomAnswerDelayMs: 0 });
    };
    const get = (difficulty: number, seed: string) => app.inject(`/api/random/${difficulty}/${seed}`);
    const solutionOf = (difficulty: number, seed: string) =>
      generatePuzzle({ difficulty, seed: `random:${seed}` }).solution;
    const post = (difficulty: number, seed: string, what: "check" | "answer", payload: Record<string, unknown> = {}) =>
      app.inject({ method: "POST", url: `/api/random/${difficulty}/${seed}/${what}`, payload });

    it("come one per 5 seconds per level, and going back is free", async () => {
      await setupPaced();
      expect((await get(0, "aaaa")).statusCode).toBe(200);
      const limited = await get(0, "bbbb");
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBe("5");
      expect((await get(0, "aaaa")).statusCode).toBe(200); // the current one
      expect((await get(1, "cccc")).statusCode).toBe(200); // another level has its own pace
      ms += 5000;
      expect((await get(0, "bbbb")).statusCode).toBe(200);
    });

    it("come at once after solving the last one", async () => {
      await setupPaced();
      await get(0, "aaaa");
      expect((await post(0, "aaaa", "check", { cells: [[0]] })).json()).toEqual({ correct: false });
      expect((await get(0, "bbbb")).statusCode).toBe(429); // a wrong answer earns nothing
      expect((await post(0, "aaaa", "check", { cells: solutionOf(0, "aaaa") })).json()).toEqual({ correct: true });
      expect((await get(0, "bbbb")).statusCode).toBe(200);
      // Re-checking the old solved one doesn't earn another.
      await post(0, "aaaa", "check", { cells: solutionOf(0, "aaaa") });
      expect((await get(0, "cccc")).statusCode).toBe(429);
    });

    it("come at once after showing the answer, which waits a little first", async () => {
      await setupPaced();
      await get(0, "aaaa");
      expect((await post(0, "aaaa", "answer")).statusCode).toBe(200);
      expect((await get(0, "bbbb")).statusCode).toBe(200);

      // The real delay (default 300 ms).
      db = openDatabase(":memory:");
      migrate(db, loadMigrations(migrationsDir));
      app = await buildApp({ db, now: () => now });
      await get(0, "aaaa");
      const t = performance.now();
      expect((await post(0, "aaaa", "answer")).statusCode).toBe(200);
      expect(performance.now() - t).toBeGreaterThanOrEqual(290);
    });
  });

  it("limits each client separately when behind the proxy", async () => {
    await setupWith({
      clientIpHeader: "cf-connecting-ip",
      policies: { generation: { capacity: 1, refillPerSecond: 0.01 } },
    });
    expect((await from("198.51.100.1", "/api/random/0/aaaa")).statusCode).toBe(200);
    expect((await from("198.51.100.1", "/api/random/0/bbbb")).statusCode).toBe(429);
    expect((await from("198.51.100.2", "/api/random/0/cccc")).statusCode).toBe(200);
  });

  it("caps generation across all clients together", async () => {
    await setupWith({
      clientIpHeader: "cf-connecting-ip",
      policies: { generationGlobal: { capacity: 2, refillPerSecond: 0.01 } },
    });
    expect((await from("198.51.100.1", "/api/random/0/aaaa")).statusCode).toBe(200);
    expect((await from("198.51.100.2", "/api/random/0/bbbb")).statusCode).toBe(200);
    expect((await from("198.51.100.3", "/api/random/0/cccc")).statusCode).toBe(429);
  });

  it("does not limit the web app's static files or SPA routes", async () => {
    await setupWith({ policies: { api: { capacity: 1, refillPerSecond: 0.01 } } });
    await app.inject("/api/health");
    expect((await app.inject("/api/health")).statusCode).toBe(429);
    expect((await app.inject("/2026-11-10")).statusCode).not.toBe(429);
  });
});

describe("GET /api/archive", () => {
  it("lists days with a puzzle at the difficulty, newest first, never the future", async () => {
    await setup();
    for (const day of ["2026-11-08", "2026-11-10", "2026-11-09"]) {
      now = new Date(`${day}T12:00:00Z`);
      await app.inject("/api/puzzles/today");
    }
    await app.inject("/api/puzzles/today?difficulty=0"); // Easy, on the 9th
    now = new Date("2026-11-09T12:00:00Z"); // the 10th is "the future" again

    const medium = (await app.inject("/api/archive")).json();
    expect(medium).toEqual({ difficulty: 1, today: "2026-11-09", dates: ["2026-11-09", "2026-11-08"] });
    expect((await app.inject("/api/archive?difficulty=0")).json().dates).toEqual(["2026-11-09"]);
    expect((await app.inject("/api/archive?difficulty=2")).json().dates).toEqual([]);
    expect((await app.inject("/api/archive?difficulty=9")).statusCode).toBe(400);
  });
});
