/**
 * The shape stored in `ResearchReport.payload`.
 *
 * The report row keeps the structured agent output plus the derived signals, so
 * the signals page and the scoring job can read one row instead of re-deriving
 * from raw source text. Reading it back goes through `readResearchPayload`,
 * which is permissive: a payload written by an older build must degrade to
 * partial data rather than break a page.
 */

import { z } from "zod";
import type { DetectedSignal } from "./signals";
import type { ResearchOutput } from "~~/server/lib/ai/agents/research";
import type { Opportunity } from "~~/server/lib/ai/agents/opportunity";

export const RESEARCH_PAYLOAD_VERSION = 1;

export type ResearchPayload = {
  version: number;
  summary: string;
  signals: DetectedSignal[];
  technologies: string[];
  opportunities: Opportunity[];
  /** What people discovery did to the People tab (created / enriched contacts). */
  people?: {
    found: number;
    created: { id: string; name: string; email: string | null }[];
    enriched: { id: string; name: string; email: string }[];
    matched?: number;
    /** Phone and fax numbers seen on the pages, with where they were seen. */
    phones?: { number: string; kind: "phone" | "fax"; sourceUrl: string | null }[];
  };
  report: ResearchOutput | null;
  sources: { id: string; kind: string; url: string | null; title: string | null }[];
  provider: string;
  model: string;
  generatedAt: string;
  /** Non-fatal problems: a page that would not load, an agent that failed. */
  warnings: string[];
};

const signalSchema = z.object({
  type: z.string(),
  label: z.string(),
  family: z.enum(["PAIN", "HIRING", "GROWTH", "TRIGGER"]),
  keyword: z.string(),
  evidence: z.string(),
  sourceId: z.string().optional(),
  sourceLabel: z.string(),
  sourceUrl: z.string().optional(),
  weight: z.number(),
  origin: z.enum(["RULE", "AI"]),
});

const payloadSchema = z.object({
  version: z.number().default(RESEARCH_PAYLOAD_VERSION),
  summary: z.string().default(""),
  signals: z.array(signalSchema).default([]),
  technologies: z.array(z.string()).default([]),
  opportunities: z.array(z.looseObject({})).default([]),
  people: z
    .object({
      found: z.number().default(0),
      created: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            email: z.string().nullable().default(null),
          }),
        )
        .default([]),
      enriched: z
        .array(z.object({ id: z.string(), name: z.string(), email: z.string() }))
        .default([]),
      matched: z.number().optional(),
      phones: z
        .array(
          z.object({
            number: z.string(),
            kind: z.enum(["phone", "fax"]).default("phone"),
            sourceUrl: z.string().nullable().default(null),
          }),
        )
        .optional(),
    })
    .optional(),
  report: z.unknown().nullable().default(null),
  sources: z
    .array(
      z.object({
        id: z.string(),
        kind: z.string(),
        url: z.string().nullable().default(null),
        title: z.string().nullable().default(null),
      }),
    )
    .default([]),
  provider: z.string().default("unknown"),
  model: z.string().default("unknown"),
  generatedAt: z.string().default(""),
  warnings: z.array(z.string()).default([]),
});

/** Safe reader for the JSON column. Returns null when the payload is unusable. */
export function readResearchPayload(value: unknown): ResearchPayload | null {
  if (!value || typeof value !== "object") return null;
  const parsed = payloadSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as unknown as ResearchPayload;
}
