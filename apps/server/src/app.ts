import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import {
  DEFAULT_DIFFICULTY,
  isIsoDate,
  isRandomSeed,
  nextUtcMidnight,
  type ApiError,
  type CheckRequest,
  type CheckResponse,
  type PuzzleResponse,
  type RandomPuzzleResponse,
} from "@trackle/shared";
import type { Db } from "./db/connection.ts";
import { registerLabRoutes } from "./lab/routes.ts";
import { DailyPuzzles } from "./puzzles/dailyPuzzles.ts";
import { DIFFICULTIES } from "./puzzles/difficulty.ts";
import { RandomPuzzles } from "./puzzles/randomPuzzles.ts";
import { PuzzleRepository } from "./puzzles/repository.ts";
import { checkBodySchema } from "./schemas.ts";

export interface AppOptions {
  db: Db;
  /** Injectable clock, so tests can pick "today". */
  now?: () => Date;
  /** Serve the built web app from here, if it exists. */
  webDistDir?: string;
  logger?: boolean;
  /** Development-only puzzle lab routes (ENABLE_LAB=1). Never enable in production. */
  enableLab?: boolean;
}

/** Build the Fastify app without listening, so tests can use app.inject(). */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const now = options.now ?? (() => new Date());
  const app = Fastify({ logger: options.logger ?? false });
  const daily = new DailyPuzzles(new PuzzleRepository(options.db), now);
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
      const body: CheckResponse = { correct };
      return body;
    },
  );

  // ---- random puzzles: not stored, (difficulty, seed) regenerates the puzzle ----

  type RandomRequest = { Params: { difficulty: string; seed: string } };
  const parseRandom = (params: RandomRequest["Params"]): { difficulty: number; seed: string } | ApiError => {
    const difficulty = parseDifficulty(params.difficulty);
    if (difficulty === null) return invalidDifficulty;
    if (!isRandomSeed(params.seed)) return invalidSeed;
    return { difficulty, seed: params.seed };
  };

  app.get<RandomRequest>("/api/random/:difficulty/:seed", async (req, reply) => {
    const parsed = parseRandom(req.params);
    if ("error" in parsed) return reply.code(400).send(parsed);
    const body: RandomPuzzleResponse = { puzzle: random.get(parsed.difficulty, parsed.seed).puzzle, seed: parsed.seed };
    return body;
  });

  app.post<RandomRequest & { Body: CheckRequest }>(
    "/api/random/:difficulty/:seed/check",
    { schema: { body: checkBodySchema } },
    async (req, reply) => {
      const parsed = parseRandom(req.params);
      if ("error" in parsed) return reply.code(400).send(parsed);
      const body: CheckResponse = { correct: random.check(parsed.difficulty, parsed.seed, req.body.cells) };
      return body;
    },
  );

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
