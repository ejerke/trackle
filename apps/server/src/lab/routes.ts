import { validateTrack, type CheckRequest, type CheckResponse, type LabPuzzleResponse } from "@trackle/shared";
import type { FastifyInstance } from "fastify";
import { DIFFICULTIES } from "../puzzles/difficulty.ts";
import { generatePuzzle } from "../puzzles/generator.ts";
import { checkBodySchema } from "../schemas.ts";

/**
 * DEVELOPMENT ONLY (enabled with ENABLE_LAB=1). Generates puzzles for any
 * difficulty and seed without storing them, so candidates can be play-tested.
 * Checking works by regenerating: same seed, same puzzle.
 */
export function registerLabRoutes(app: FastifyInstance): void {
  type Params = { difficulty: string; seed: string };
  const parse = (p: Params) => {
    const difficulty = Number(p.difficulty);
    const ok = Number.isInteger(difficulty) && DIFFICULTIES[difficulty] !== undefined && p.seed.length <= 100;
    return ok ? difficulty : null;
  };

  app.get<{ Params: Params }>("/api/lab/:difficulty/:seed", async (req, reply) => {
    const difficulty = parse(req.params);
    if (difficulty === null) return reply.code(404).send({ error: "not_found" });
    const t = performance.now();
    const g = generatePuzzle({ difficulty, seed: req.params.seed });
    const body: LabPuzzleResponse = {
      puzzle: { ...g.layout, date: "lab", difficulty },
      seed: req.params.seed,
      metrics: g.metrics,
      attempts: g.attempts,
      accepted: g.accepted,
      violations: g.violations,
      generationMs: Math.round(performance.now() - t),
    };
    return body;
  });

  app.post<{ Params: Params; Body: CheckRequest }>(
    "/api/lab/:difficulty/:seed/check",
    { schema: { body: checkBodySchema } },
    async (req, reply) => {
      const difficulty = parse(req.params);
      if (difficulty === null) return reply.code(404).send({ error: "not_found" });
      const { layout } = generatePuzzle({ difficulty, seed: req.params.seed });
      const body: CheckResponse = { correct: validateTrack(layout, req.body.cells).ok };
      return body;
    },
  );
}
