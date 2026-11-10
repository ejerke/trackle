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
