import { fileURLToPath } from "node:url";
import {
  CHALLENGE_DIFFICULTY,
  challengePoints,
  emptyProgress,
  type CheckResponse,
  type LeaderboardResponse,
  type PuzzleProgress,
} from "@trackle/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { SESSION_COOKIE } from "../auth/routes.ts";
import { openDatabase, type Db } from "../db/connection.ts";
import { loadMigrations, migrate } from "../db/migrate.ts";
import { generatePuzzle } from "../puzzles/generator.ts";
import { PuzzleRepository } from "../puzzles/repository.ts";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));
const NOW = new Date("2026-11-10T12:00:00Z");
/** The server's clock: each solve() moves it to when that sync happens. */
let now = NOW;
let app: FastifyInstance;
let db: Db;

async function setup() {
  db = openDatabase(":memory:");
  migrate(db, loadMigrations(migrationsDir));
  now = NOW;
  app = await buildApp({ db, now: () => now, passwordParams: { N: 2 ** 10, r: 8, p: 1 } });
}
afterEach(async () => {
  await app?.close();
  db?.close();
});

async function signIn(username: string): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: { username, password: "correct horse" } });
  return [res.headers["set-cookie"]].flat()[0]!.split(";")[0]!.split("=")[1]!;
}
const auth = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });
/** The board as seen "today" (NOW), whenever the last sync happened. */
const board = async (period: string, token?: string) => {
  now = NOW;
  return (await app.inject({ url: `/api/leaderboard?period=${period}`, headers: token ? auth(token) : {} })).json<LeaderboardResponse>();
};
const show = (token: string, visible = true) =>
  app.inject({ method: "PUT", url: "/api/me/leaderboard", headers: auth(token), payload: { visible } });

/**
 * A stored Challenge for `date`. Generating a real 10x10 Challenge takes a
 * while, so a small puzzle stands in: the leaderboard only reads the clues.
 */
function challengeOn(date: string, seed = date): { solution: number[][]; points: number } {
  const g = generatePuzzle({ difficulty: 0, seed });
  new PuzzleRepository(db).insertIfAbsent({
    puzzle: { ...g.layout, date, difficulty: CHALLENGE_DIFFICULTY },
    solution: g.solution,
    seed,
    generatorVersion: 3,
  });
  return { solution: g.solution, points: challengePoints(g.layout) };
}

/**
 * Sync a solve of the Challenge on `date`. The browser says it was solved at
 * `solvedAt`; the sync reaches the server at `syncedAt` (default: the same).
 */
async function solve(
  token: string,
  date: string,
  solution: number[][],
  solvedAt: string,
  extra: Partial<PuzzleProgress> = {},
  syncedAt = solvedAt,
) {
  now = new Date(syncedAt);
  const record: PuzzleProgress = {
    ...emptyProgress({ kind: "daily", date, difficulty: CHALLENGE_DIFFICULTY }, "fp", new Date(`${date}T08:00:00Z`)),
    updatedAt: solvedAt,
    solvedAt,
    solvedCells: solution,
    ...extra,
  };
  const res = await app.inject({ method: "PUT", url: "/api/me/progress", headers: auth(token), payload: { records: [record] } });
  expect(res.statusCode).toBe(200);
}

describe("Challenge leaderboard", () => {
  it("scores a Challenge solved on its day, but shows the name only after opting in", async () => {
    await setup();
    const { solution, points } = challengeOn("2026-11-10");
    const alice = await signIn("alice");
    await solve(alice, "2026-11-10", solution, "2026-11-10T11:00:00.000Z");

    const hidden = await board("month", alice);
    expect(hidden.entries).toEqual([]);
    expect(hidden.me).toEqual({ rank: null, points, solved: 1, visible: false });
    expect(hidden.from).toBe("2026-11-01");

    expect((await show(alice)).json().user.onLeaderboard).toBe(true);
    const shown = await board("month", alice);
    expect(shown.entries).toEqual([{ rank: 1, username: "alice", points, solved: 1 }]);
    expect(shown.me).toEqual({ rank: 1, points, solved: 1, visible: true });
    expect((await app.inject({ url: "/api/auth/me", headers: auth(alice) })).json().user.onLeaderboard).toBe(true);
  });

  it("doesn't score a Challenge solved on a later day, from the archive", async () => {
    await setup();
    const { solution } = challengeOn("2026-11-09");
    const alice = await signIn("alice");
    await show(alice);
    await solve(alice, "2026-11-09", solution, "2026-11-10T09:00:00.000Z");
    expect((await board("all", alice)).me).toMatchObject({ points: 0, solved: 0 });
  });

  it("doesn't score other levels, a wrong answer, or a shown answer", async () => {
    await setup();
    const { solution } = challengeOn("2026-11-10");
    const alice = await signIn("alice");
    const bob = await signIn("bob");
    const carol = await signIn("carol");
    for (const t of [alice, bob, carol]) await show(t);
    // A wrong answer is dropped by the server's check of the solve.
    await solve(alice, "2026-11-10", solution.map((row) => row.map(() => 0)), "2026-11-10T11:00:00.000Z");
    await solve(bob, "2026-11-10", solution, "2026-11-10T11:00:00.000Z", { revealedAt: "2026-11-10T10:00:00.000Z" });
    await app.inject("/api/puzzles/today?difficulty=0");
    const easy = new PuzzleRepository(db).find("2026-11-10", 0)!.solution;
    now = NOW;
    const record: PuzzleProgress = {
      ...emptyProgress({ kind: "daily", date: "2026-11-10", difficulty: 0 }, "fp", NOW),
      solvedAt: "2026-11-10T11:00:00.000Z",
      solvedCells: easy,
    };
    await app.inject({ method: "PUT", url: "/api/me/progress", headers: auth(carol), payload: { records: [record] } });
    expect((await board("all")).entries).toEqual([]);
  });

  it("counts this month or all time, ranks by points, and shares a rank on a tie", async () => {
    await setup();
    const oct = challengeOn("2026-10-31", "oct");
    const nov = challengeOn("2026-11-10", "nov");
    const [alice, bob, carol] = [await signIn("alice"), await signIn("bob"), await signIn("carol")];
    for (const t of [alice, bob, carol]) await show(t);
    await solve(alice, "2026-10-31", oct.solution, "2026-10-31T20:00:00.000Z");
    await solve(alice, "2026-11-10", nov.solution, "2026-11-10T10:00:00.000Z");
    await solve(bob, "2026-11-10", nov.solution, "2026-11-10T10:30:00.000Z");
    await solve(carol, "2026-10-31", oct.solution, "2026-10-31T23:59:00.000Z");

    const all = await board("all");
    expect(all.from).toBeNull();
    expect(all.me).toBeNull(); // signed out
    expect(all.entries[0]).toEqual({ rank: 1, username: "alice", points: oct.points + nov.points, solved: 2 });

    const month = await board("month");
    expect(month.entries).toEqual([
      { rank: 1, username: "alice", points: nov.points, solved: 1 },
      { rank: 1, username: "bob", points: nov.points, solved: 1 },
    ]);
  });

  it("doesn't trust a backdated solve: the server's own clock must agree", async () => {
    await setup();
    const { solution } = challengeOn("2026-11-08");
    const alice = await signIn("alice");
    await show(alice);
    // Solved two days late, but the request claims it was on the day.
    await solve(alice, "2026-11-08", solution, "2026-11-08T20:00:00.000Z", {}, "2026-11-10T12:00:00.000Z");
    expect((await board("all", alice)).me).toMatchObject({ points: 0, solved: 0 });
  });

  it("gives a solve just before midnight a few minutes to reach the server, and keeps the first stamp", async () => {
    await setup();
    const day = challengeOn("2026-11-09", "a");
    const late = challengeOn("2026-11-08", "b");
    const alice = await signIn("alice");
    await show(alice);
    await solve(alice, "2026-11-09", day.solution, "2026-11-09T23:59:00.000Z", {}, "2026-11-10T00:05:00.000Z");
    await solve(alice, "2026-11-08", late.solution, "2026-11-08T23:59:00.000Z", {}, "2026-11-09T00:15:00.000Z");
    // Syncing the same solve again later doesn't move its stamp.
    await solve(alice, "2026-11-09", day.solution, "2026-11-09T23:59:00.000Z", {}, "2026-11-12T08:00:00.000Z");
    expect((await board("all", alice)).me).toMatchObject({ points: day.points, solved: 1 });
  });

  it("counts a Challenge solved signed out, when the account comes days later: the receipt proves the day", async () => {
    await setup();
    const { solution, points } = challengeOn("2026-11-09");
    now = new Date("2026-11-09T21:00:00Z");
    const url = `/api/puzzles/2026-11-09/check?difficulty=${CHALLENGE_DIFFICULTY}`;
    const wrong = (await app.inject({ method: "POST", url, payload: { cells: solution.map((row) => row.map(() => 0)) } })).json();
    expect(wrong).toEqual({ correct: false }); // no receipt for a wrong track
    const check = (await app.inject({ method: "POST", url, payload: { cells: solution } })).json<CheckResponse>();
    expect(check.receipt?.at).toBe("2026-11-09T21:00:00.000Z");

    now = new Date("2026-11-12T10:00:00Z"); // signs up three days later; the browser's progress is imported
    const alice = await signIn("alice");
    await show(alice);
    await solve(alice, "2026-11-09", solution, "2026-11-09T21:00:00.000Z", { solveReceipt: check.receipt! }, "2026-11-12T10:00:00.000Z");
    expect((await board("all", alice)).me).toMatchObject({ points, solved: 1 });
  });

  it("ignores a forged receipt, or one made for another puzzle", async () => {
    await setup();
    const a = challengeOn("2026-11-08", "a");
    const b = challengeOn("2026-11-09", "b");
    now = new Date("2026-11-09T21:00:00Z");
    const forB = (
      await app.inject({ method: "POST", url: `/api/puzzles/2026-11-09/check?difficulty=${CHALLENGE_DIFFICULTY}`, payload: { cells: b.solution } })
    ).json<CheckResponse>().receipt!;
    const alice = await signIn("alice");
    await show(alice);
    const late = "2026-11-10T12:00:00.000Z";
    // A made-up signature for an on-time solve.
    await solve(alice, "2026-11-08", a.solution, "2026-11-08T20:00:00.000Z", { solveReceipt: { at: "2026-11-08T20:00:00.000Z", sig: forB.sig } }, late);
    // A genuine receipt, but for the next day's puzzle.
    expect((await board("all", alice)).me).toMatchObject({ points: 0 });
    const bob = await signIn("bob");
    await solve(bob, "2026-11-08", a.solution, "2026-11-08T20:00:00.000Z", { solveReceipt: forB }, late);
    expect((await board("all", bob)).me).toMatchObject({ points: 0 });
  });

  it("rejects an unknown period, and opting in needs an account", async () => {
    await setup();
    expect((await app.inject("/api/leaderboard?period=week")).json()).toEqual({ error: "invalid_period" });
    const res = await app.inject({ method: "PUT", url: "/api/me/leaderboard", payload: { visible: true } });
    expect(res.statusCode).toBe(401);
  });
});

describe("the Challenge level", () => {
  it("has no random puzzles and gives no hints or answers, signed in or not", async () => {
    await setup();
    expect((await app.inject(`/api/random/${CHALLENGE_DIFFICULTY}/abcd1234`)).json()).toEqual({ error: "invalid_difficulty" });
    const { solution } = challengeOn("2026-11-10");
    const empty = solution.map((row) => row.map(() => 0));
    const alice = await signIn("alice");
    for (const headers of [{}, auth(alice)]) {
      for (const kind of ["track", "empty"]) {
        const hint = await app.inject({
          method: "POST",
          url: `/api/puzzles/2026-11-10/hint?difficulty=${CHALLENGE_DIFFICULTY}`,
          headers,
          payload: { kind, cells: empty },
        });
        expect(hint.json()).toEqual({ error: "hint_limit" });
      }
      const answer = await app.inject({
        method: "POST",
        url: `/api/puzzles/2026-11-10/answer?difficulty=${CHALLENGE_DIFFICULTY}`,
        headers,
        payload: {},
      });
      expect(answer.json()).toEqual({ error: "answer_unavailable" });
    }
  });
});
