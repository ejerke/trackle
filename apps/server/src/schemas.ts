/** JSON schema for a HintRequest body. */
export const hintBodySchema = {
  type: "object",
  required: ["cells"],
  additionalProperties: false,
  properties: {
    cells: {
      type: "array",
      maxItems: 20,
      items: { type: "array", maxItems: 20, items: { type: "integer", minimum: 0, maximum: 15 } },
    },
    emptyCells: {
      type: "array",
      maxItems: 400,
      items: { type: "array", minItems: 2, maxItems: 2, items: { type: "integer", minimum: 0, maximum: 19 } },
    },
  },
} as const;

/** Bodies that carry nothing ({}), e.g. POST .../answer. */
export const emptyBodySchema = { type: "object", additionalProperties: false, properties: {} } as const;

/** JSON schema for a CheckRequest body (validated by Fastify before the handler runs). */
export const checkBodySchema = {
  type: "object",
  required: ["cells"],
  additionalProperties: false,
  properties: {
    cells: {
      type: "array",
      maxItems: 20,
      items: { type: "array", maxItems: 20, items: { type: "integer", minimum: 0, maximum: 15 } },
    },
  },
} as const;
