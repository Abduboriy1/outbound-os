import { z } from "zod";

/**
 * Converts an agent's Zod output schema into the JSON Schema handed to the
 * provider. Zod 4 already emits `required` and `additionalProperties: false`,
 * which is what strict structured output needs; the `$schema` key is dropped
 * because providers reject unknown top-level members.
 */
export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
}

/** Shared claim confidence: models like emitting percentages, so accept both. */
export const confidence = z
  .number()
  .transform((value) => (value > 1 ? value / 100 : value))
  .pipe(z.number().min(0).max(1));
