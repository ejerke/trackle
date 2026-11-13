import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
  DEFAULT_DIFFICULTY,
  canShowAnswer,
  hintsLeft,
  isDailyOnly,
  isIsoDate,
  isRandomSeed,
  nextUtcMidnight,
  puzzleKeyId,
  type ApiError,
  type CheckRequest,
  type CheckResponse,
  type AnswerResponse,
  type ArchiveResponse,
  type HintRequest,
  type HintResponse,
  type PuzzleKey,
  type PuzzleLayout,
  type PuzzleResponse,
  type RandomPuzzleResponse,
} from "@trackle/shared";
import type { Db } from "./db/connection.ts";
import { registerLabRoutes } from "./lab/routes.ts";
import { Leaderboard, registerLeaderboardRoutes } from "./leaderboard/leaderboard.ts";
import { DailyPuzzles } from "./puzzles/dailyPuzzles.ts";
import { DIFFICULTIES } from "./puzzles/difficulty.ts";
import { RandomPuzzles } from "./puzzles/randomPuzzles.ts";
import { PuzzleRepository } from "./puzzles/repository.ts";
import { registerAuthRoutes } from "./auth/routes.ts";
import { ProgressSync } from "./progress/progressSync.ts";
import { SolveReceipts } from "./progress/receipts.ts";
import { registerProgressRoutes } from "./progress/routes.ts";
import type { ScryptParams } from "./auth/password.ts";
import { registerRateLimits, type RateLimitOptions } from "./rateLimit/rateLimit.ts";
import { computeHint } from "./puzzles/hints.ts";
import { checkBodySchema, emptyBodySchema, hintBodySchema } from "./schemas.ts";

export interface AppOptions {
  db: Db;
  /** Injectable clock, so tests can pick "today". */
  now?: () => Date;
  /** Serve the built web app from here, if it exists. */
  webDistDir?: string;
  logger?: boolean;
  /** Development-only puzzle lab routes (ENABLE_LAB=1). Never enable in production. */
  enableLab?: boolean;
  /** Rate-limit settings (policies, client IP header). Limits are always on. */
  rateLimit?: RateLimitOptions;
  /** Mark the session cookie Secure (HTTPS only). Default false; production sets it. */
  secureCookies?: boolean;
  /** Password hashing cost; tests use cheaper settings. */
  passwordParams?: ScryptParams;
  /**
   * Deliberate wait before a random puzzle's answer, in ms (default 300).
   * Showing the answer earns the next random puzzle at once, like solving,
   * so this keeps "answer, next, answer, next" from being instant.
   */
  randomAnswerDelayMs?: number;
}

/** Build the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? (() => new Date());
  const app = Fastify({ logger: options.logger ?? false });
  const puzzleRepository = new PuzzleRepository(options.db);
  const daily = new DailyPuzzles(puzzleRepository, now);
  const random = new RandomPuzzles();

  const puzzleResponse = (puzzle: PuzzleResponse["puzzle"]): PuzzleResponse => ({
    puzzle,
    nextPuzzleAt: nextUtcMidnight(now()).toISOString(),
  });
  const notFound: ApiError = { error: "not_found" };
  const invalidDate: ApiError = { error: "invalid_date" };
  const invalidDifficulty: ApiError = { error: "invalid_difficulty" };
  const invalidSeed: ApiError = { error: "invalid_seed" };

  /** A known difficulty level, or null. `undefined` (not given) means the default. */
  const parseDifficulty = (value: string | undefined): number | null => {
    if (value === undefined) return DEFAULT_DIFFICULTY;
    const d = Number(value);
    return /^\d+$/.test(value) && DIFFICULTIES[d] !== undefined ? d : null;
  };
  type DailyRequest = { Params: { date: string }; Querystring: { difficulty?: string } };

  // Body validation failures get our own error shape instead of Fastify's default message.
  app.setErrorHandler((err: { validation?: unknown; statusCode?: number }, _req, reply) => {
    if (err.validation) return reply.code(400).send({ error: "invalid_body" } satisfies ApiError);
    throw err;
  });

  const limits = registerRateLimits(app, options.rateLimit);

  // CSRF defence in depth (with SameSite=Lax cookies): every API write must be
  // JSON. A malicious page can make a browser POST a form cross-site, but a
  // form can't send Content-Type: application/json.
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/") || req.method === "GET" || req.method === "HEAD") return;
    if (!req.headers["content-type"]?.startsWith("application/json")) {
      return reply.code(415).send({ error: "unsupported_media_type" } satisfies ApiError);
    }
  });

  const { currentUser } = registerAuthRoutes(app, {
    db: options.db,
    now,
    limits,
    secureCookies: options.secureCookies ?? false,
    passwordParams: options.passwordParams,
  });
  const receipts = new SolveReceipts(options.db);
  const progressSync = new ProgressSync(options.db, puzzleRepository, now, receipts);
  registerProgressRoutes(app, progressSync, currentUser);
  registerLeaderboardRoutes(app, new Leaderboard(options.db, now), currentUser);

  /**
   * Hints and answers (ADR 0014). Shared by daily and random routes: given the
   * puzzle, compute the response and record the help for a signed-in player.
   */
  const giveHint = (
    req: FastifyRequest,
    reply: FastifyReply,
    key: PuzzleKey,
    layout: PuzzleLayout,
    solution: number[][],
    body: HintRequest,
  ) => {
    const kind = body.kind ?? "track";
    // A level without this kind of hint (the Challenge, Super-duper hard) gives
    // none to anybody, signed in or not, first try or "Try again".
    if (hintsLeft(key.difficulty, 0, kind) === 0) return reply.code(403).send({ error: "hint_limit" } satisfies ApiError);
    const hint: HintResponse = computeHint(layout, solution, body.cells, body.emptyCells, kind);
    if (hint.kind === "complete") return hint; // not help, so never limited
    const user = currentUser(req);
    const stored = user ? progressSync.get(user.id, key) : null;
    // A finished puzzle being played again ("Try again", ADR 0024): its hints
    // count for nothing and its own limits live on the device, like signed out.
    const replay = stored !== null && (stored.solvedAt !== null || stored.revealedAt !== null);
    if (user && !replay) {
      // Per-level hint limits (LEVELS in @trackle/shared, one per kind) are enforced where
      // the server knows the count: for signed-in players. Signed out, the browser enforces them.
      const used = (kind === "track" ? stored?.hintsUsed : stored?.emptyHintsUsed) ?? 0;
      if (hintsLeft(key.difficulty, used, kind) === 0) return reply.code(403).send({ error: "hint_limit" } satisfies ApiError);
      progressSync.recordHelp(user.id, key, layout, solution, kind === "track" ? "hint" : "emptyHint");
    }
    return hint;
  };
  const giveAnswer = (req: FastifyRequest, reply: FastifyReply, key: PuzzleKey, layout: PuzzleLayout, solution: number[][]) => {
    // Some levels (Hard) never show answers, for anyone: the server knows the
    // difficulty, so this needs no account.
    if (!canShowAnswer(key.difficulty)) return reply.code(403).send({ error: "answer_unavailable" } satisfies ApiError);
    const user = currentUser(req);
    if (user) progressSync.recordHelp(user.id, key, layout, solution, "answer");
    const body: AnswerResponse = { cells: solution };
    return body;
  };

  app.get("/api/health", async () => ({ ok: true }));

  // ---- daily puzzles: one per UTC day and difficulty ----

  app.get<{ Querystring: { difficulty?: string } }>("/api/puzzles/today", async (req, reply) => {
    const difficulty = parseDifficulty(req.query.difficulty);
    if (difficulty === null) return reply.code(400).send(invalidDifficulty);
    const stored = daily.get(daily.today(), difficulty);
    if (!stored) throw new Error("Today's puzzle could not be created");
    return puzzleResponse(stored.puzzle);
  });

  app.get<DailyRequest>("/api/puzzles/:date", async (req, reply) => {
    if (!isIsoDate(req.params.date)) return reply.code(400).send(invalidDate);
    const difficulty = parseDifficulty(req.query.difficulty);
    if (difficulty === null) return reply.code(400).send(invalidDifficulty);
    const stored = daily.get(req.params.date, difficulty);
    if (!stored) return reply.code(404).send(notFound);
    return puzzleResponse(stored.puzzle);
  });

  app.post<DailyRequest & { Body: CheckRequest }>(
    "/api/puzzles/:date/check",
    { schema: { body: checkBodySchema } },
    async (req, reply) => {
      if (!isIsoDate(req.params.date)) return reply.code(400).send(invalidDate);
      const difficulty = parseDifficulty(req.query.difficulty);
      if (difficulty === null) return reply.code(400).send(invalidDifficulty);
      const correct = daily.check(req.params.date, difficulty, req.body.cells, req.log);
      if (correct === null) return reply.code(404).send(notFound);
      // A receipt for every correct daily solve, signed in or not: it proves
      // later when the solve happened (ADR 0025).
      const keyId = puzzleKeyId({ kind: "daily", date: req.params.date, difficulty });
      const body: CheckResponse = correct ? { correct, receipt: receipts.issue(keyId, now()) } : { correct };
      return body;
    },
  );

  app.post<DailyRequest & { Body: HintRequest }>(
    "/api/puzzles/:date/hint",
    { schema: { body: hintBodySchema } },
    async (req, reply) => {
      if (!isIsoDate(req.params.date)) return reply.code(400).send(invalidDate);
      const difficulty = parseDifficulty(req.query.difficulty);
      if (difficulty === null) return reply.code(400).send(invalidDifficulty);
      const stored = daily.existing(req.params.date, difficulty);
      if (!stored) return reply.code(404).send(notFound);
      return giveHint(req, reply, { kind: "daily", date: req.params.date, difficulty }, stored.puzzle, stored.solution, req.body);
    },
  );

  app.post<DailyRequest>("/api/puzzles/:date/answer", { schema: { body: emptyBodySchema } }, async (req, reply) => {
    if (!isIsoDate(req.params.date)) return reply.code(400).send(invalidDate);
    const difficulty = parseDifficulty(req.query.difficulty);
    if (difficulty === null) return reply.code(400).send(invalidDifficulty);
    const stored = daily.existing(req.params.date, difficulty);
    if (!stored) return reply.code(404).send(notFound);
    return giveAnswer(req, reply, { kind: "daily", date: req.params.date, difficulty }, stored.puzzle, stored.solution);
  });

  app.get<{ Querystring: { difficulty?: string } }>("/api/archive", async (req, reply) => {
    const difficulty = parseDifficulty(req.query.difficulty);
    if (difficulty === null) return reply.code(400).send(invalidDifficulty);
    const body: ArchiveResponse = { difficulty, today: daily.today(), dates: daily.archive(difficulty) };
    return body;
  });

  // ---- random puzzles: not stored, (difficulty, seed) regenerates the puzzle ----

  type RandomRequest = { Params: { difficulty: string; seed: string } };
  const parseRandom = (params: RandomRequest["Params"]): { difficulty: number; seed: string } | ApiError => {
    const difficulty = parseDifficulty(params.difficulty);
    // Daily-only levels (the Challenge) have no random puzzles: points can't be farmed.
    if (difficulty === null || isDailyOnly(difficulty)) return invalidDifficulty;
    if (!isRandomSeed(params.seed)) return invalidSeed;
    return { difficulty, seed: params.seed };
  };

  app.get<RandomRequest>("/api/random/:difficulty/:seed", async (req, reply) => {
    const parsed = parseRandom(req.params);
    if ("error" in parsed) return reply.code(400).send(parsed);
    // Only a cache miss costs CPU, so only that is a *new* puzzle for the limits.
    if (!random.has(parsed.difficulty, parsed.seed) && !limits.allowNewRandom(req, reply, parsed.difficulty, parsed.seed)) {
      return reply;
    }
    const body: RandomPuzzleResponse = { puzzle: random.get(parsed.difficulty, parsed.seed).puzzle, seed: parsed.seed };
    return body;
  });

  app.post<RandomRequest & { Body: CheckRequest }>(
    "/api/random/:difficulty/:seed/check",
    { schema: { body: checkBodySchema } },
    async (req, reply) => {
      const parsed = parseRandom(req.params);
      if ("error" in parsed) return reply.code(400).send(parsed);
      if (!random.has(parsed.difficulty, parsed.seed) && !limits.allowGeneration(req, reply)) return reply;
      const body: CheckResponse = { correct: random.check(parsed.difficulty, parsed.seed, req.body.cells) };
      if (body.correct) limits.finishedRandom(req, parsed.difficulty, parsed.seed);
      return body;
    },
  );

  app.post<RandomRequest & { Body: HintRequest }>(
    "/api/random/:difficulty/:seed/hint",
    { schema: { body: hintBodySchema } },
    async (req, reply) => {
      const parsed = parseRandom(req.params);
      if ("error" in parsed) return reply.code(400).send(parsed);
      if (!random.has(parsed.difficulty, parsed.seed) && !limits.allowGeneration(req, reply)) return reply;
      const { puzzle, solution } = random.get(parsed.difficulty, parsed.seed);
      return giveHint(req, reply, { kind: "random", seed: parsed.seed, difficulty: parsed.difficulty }, puzzle, solution, req.body);
    },
  );

  app.post<RandomRequest>("/api/random/:difficulty/:seed/answer", { schema: { body: emptyBodySchema } }, async (req, reply) => {
    const parsed = parseRandom(req.params);
    if ("error" in parsed) return reply.code(400).send(parsed);
    if (!canShowAnswer(parsed.difficulty)) return reply.code(403).send({ error: "answer_unavailable" } satisfies ApiError);
    if (!random.has(parsed.difficulty, parsed.seed) && !limits.allowGeneration(req, reply)) return reply;
    const { puzzle, solution } = random.get(parsed.difficulty, parsed.seed);
    await sleep(options.randomAnswerDelayMs ?? 300);
    limits.finishedRandom(req, parsed.difficulty, parsed.seed);
    return giveAnswer(req, reply, { kind: "random", seed: parsed.seed, difficulty: parsed.difficulty }, puzzle, solution);
  });

  if (options.enableLab) registerLabRoutes(app);

  if (options.webDistDir && existsSync(options.webDistDir)) {
    await app.register(fastifyStatic, { root: options.webDistDir, wildcard: false });
  }

  // Unknown /api/* -> JSON 404. Any other GET -> index.html, so /2026-11-10 works (SPA fallback).
  app.setNotFoundHandler((req, reply) => {
    const servesWeb = options.webDistDir && existsSync(options.webDistDir);
    if (req.method === "GET" && !req.url.startsWith("/api/") && servesWeb) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send(notFound);
  });

  return app;
}
