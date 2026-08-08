import { z } from "zod";
import {
  FIT_FACTORS,
  OPPORTUNITY_FACTORS,
  parseWeights,
  type ScoringWeights,
} from "~~/shared/scoring/weights";

/**
 * Shared ICP validation (plan §7). The UI and the API both parse through this
 * so a profile saved from a form and one posted by a script are identical.
 */

/** Accepts a real array or a textarea's worth of comma/newline separated text. */
export const stringList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value == null) return [] as string[];
    const parts = Array.isArray(value) ? value : value.split(/[\n,]/);
    const cleaned = parts.map((p) => p.trim()).filter(Boolean);
    return [...new Set(cleaned)].slice(0, 50);
  });

const optionalInt = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  });

const weightRecord = (keys: readonly string[]) =>
  z.record(z.enum(keys as [string, ...string[]]), z.coerce.number().min(0).max(100));

export const icpSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    industries: stringList,
    geographies: stringList,
    problems: stringList,
    targetRoles: stringList,
    minEmployees: optionalInt,
    maxEmployees: optionalInt,
    minDealSize: optionalInt,
    maxDealSize: optionalInt,
    isDefault: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => v === true || v === "on" || v === "true"),
    weights: z
      .object({
        fit: weightRecord(FIT_FACTORS).optional(),
        opportunity: weightRecord(OPPORTUNITY_FACTORS).optional(),
        blend: z
          .object({
            fit: z.coerce.number().min(0).max(1),
            opportunity: z.coerce.number().min(0).max(1),
          })
          .optional(),
      })
      .optional(),
    rules: z
      .array(
        z.object({
          field: z.string().trim().min(1).max(60),
          operator: z.string().trim().min(1).max(30),
          value: z.string().trim().min(1).max(200),
          weight: z.coerce.number().int().min(0).max(100).default(10),
        }),
      )
      .max(50)
      .optional(),
  })
  .refine(
    (v) => v.minEmployees == null || v.maxEmployees == null || v.minEmployees <= v.maxEmployees,
    { message: "Minimum employees must not exceed the maximum", path: ["minEmployees"] },
  )
  .refine(
    (v) => v.minDealSize == null || v.maxDealSize == null || v.minDealSize <= v.maxDealSize,
    { message: "Minimum deal size must not exceed the maximum", path: ["minDealSize"] },
  );

export type IcpInput = z.output<typeof icpSchema>;

/** Weights are stored as a complete blob so a later default change cannot
 *  silently retune an ICP the user has already tuned. */
export function normaliseWeights(input: unknown): ScoringWeights {
  return parseWeights(input);
}
