import { BOOKMARK_NAME_MAX } from "@trackle/shared";
import type {
  AccountUser,
  ApiError,
  ProgressListResponse,
  ProgressSaveRequest,
  ProgressSaveResponse,
  ProgressSyncRequest,
} from "@trackle/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { isValidSyncKey, type ProgressSync } from "./progressSync.ts";

const ISO_TIMESTAMP = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$";
const timestamp = { type: "string", pattern: ISO_TIMESTAMP } as const;

/** One PuzzleProgress record, with size limits so nobody can store megabytes. */
const recordSchema = {
  type: "object",
  required: [
    "schemaVersion",
    "key",
    "puzzleFingerprint",
    "board",
    "startedAt",
    "updatedAt",
    "checks",
    "solvedAt",
    "solvedCells",
    "boardSavedAt",
    "boardDirty",
    "hintsUsed",
    "emptyHintsUsed",
    "revealedAt",
    "timeMs",
    "bookmark",
    "replay",
    "solveReceipt",
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 9 },
    key: {
      type: "object",
      required: ["kind", "difficulty"],
      additionalProperties: false,
      properties: {
        kind: { enum: ["daily", "random"] },
        date: { type: "string", maxLength: 10 },
        seed: { type: "string", maxLength: 16 },
        difficulty: { type: "integer", minimum: 0, maximum: 99 },
      },
    },
    puzzleFingerprint: { type: ["string", "null"], maxLength: 16 },
    board: {
      type: "object",
      required: ["edges", "marks"],
      additionalProperties: false,
      properties: {
        edges: { type: "array", maxItems: 800, items: { type: "string", maxLength: 12 } },
        marks: { type: "object", maxProperties: 400, additionalProperties: { enum: ["track", "empty"] } },
        locked: { type: "array", maxItems: 400, items: { type: "string", maxLength: 6 } },
      },
    },
    startedAt: timestamp,
    updatedAt: timestamp,
    checks: { type: "integer", minimum: 0, maximum: 1_000_000 },
    solvedAt: { anyOf: [timestamp, { type: "null" }] },
    solvedCells: {
      anyOf: [
        { type: "null" },
        { type: "array", maxItems: 20, items: { type: "array", maxItems: 20, items: { type: "integer", minimum: 0, maximum: 15 } } },
      ],
    },
    boardSavedAt: { anyOf: [timestamp, { type: "null" }] },
    boardDirty: { type: "boolean" },
    hintsUsed: { type: "integer", minimum: 0, maximum: 10_000 },
    emptyHintsUsed: { type: "integer", minimum: 0, maximum: 10_000 },
    revealedAt: { anyOf: [timestamp, { type: "null" }] },
    // Up to a year of active play on one puzzle.
    timeMs: { type: "integer", minimum: 0, maximum: 31_536_000_000 },
    bookmark: {
      anyOf: [
        { type: "null" },
        { type: "object", required: ["on", "at"], additionalProperties: false, properties: { on: { type: "boolean" }, at: timestamp, name: { type: "string", maxLength: BOOKMARK_NAME_MAX } } },
      ],
    },
    // "Try again" stays on the device (ADR 0024): the account never takes one.
    replay: { type: "null" },
    solveReceipt: {
      anyOf: [
        { type: "null" },
        { type: "object", required: ["at", "sig"], additionalProperties: false, properties: { at: timestamp, sig: { type: "string", maxLength: 64 } } },
      ],
    },
  },
} as const;

const saveBodySchema = {
  type: "object",
  required: ["record"],
  additionalProperties: false,
  properties: { record: recordSchema },
} as const;

const syncBodySchema = {
  type: "object",
  required: ["records"],
  additionalProperties: false,
  properties: { records: { type: "array", maxItems: 200, items: recordSchema } },
} as const;

/**
 * Signed-in players' progress (ADR 0013):
 *   GET    /api/me/progress          all records
 *   PUT    /api/me/progress          automatic sync of solves/checks (unfinished boards ignored)
 *   PUT    /api/me/progress/board    explicit Save, board included
 *   DELETE /api/me/progress/:keyId   remove one record
 */
export function registerProgressRoutes(
  app: FastifyInstance,
  sync: ProgressSync,
  currentUser: (req: FastifyRequest) => AccountUser | null,
): void {
  const unauthorized: ApiError = { error: "unauthorized" };

  app.get("/api/me/progress", async (req, reply) => {
    const user = currentUser(req);
    if (!user) return reply.code(401).send(unauthorized);
    const body: ProgressListResponse = { records: sync.list(user.id) };
    return body;
  });

  app.put<{ Body: ProgressSyncRequest }>("/api/me/progress", { schema: { body: syncBodySchema } }, async (req, reply) => {
    const user = currentUser(req);
    if (!user) return reply.code(401).send(unauthorized);
    if (!req.body.records.every(isValidSyncKey)) return reply.code(400).send({ error: "invalid_body" } satisfies ApiError);
    const body: ProgressListResponse = { records: sync.sync(user.id, req.body.records) };
    return body;
  });

  app.put<{ Body: ProgressSaveRequest }>("/api/me/progress/board", { schema: { body: saveBodySchema } }, async (req, reply) => {
    const user = currentUser(req);
    if (!user) return reply.code(401).send(unauthorized);
    if (!isValidSyncKey(req.body.record)) return reply.code(400).send({ error: "invalid_body" } satisfies ApiError);
    const body: ProgressSaveResponse = { record: sync.save(user.id, req.body.record) };
    return body;
  });

  app.delete<{ Params: { keyId: string } }>("/api/me/progress/:keyId", async (req, reply) => {
    const user = currentUser(req);
    if (!user) return reply.code(401).send(unauthorized);
    sync.delete(user.id, req.params.keyId);
    return reply.code(204).send();
  });
}
