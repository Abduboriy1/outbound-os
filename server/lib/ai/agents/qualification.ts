/**
 * QualificationAgent (plan §31, feeding §12).
 *
 * Judges whether a researched company matches the ICP, and says why in terms a
 * human can argue with. It does not compute the numeric score — that is the
 * deterministic layer in `~~/server/lib/scoring`, so the number stays explainable and
 * retunable. This agent supplies the qualitative read the score cannot give.
 */

import { z } from "zod";
import type { AgentRequest } from "../prompt";
import { systemPrompt, userTurn } from "../prompt";
import { confidence, jsonSchemaOf } from "../schema";
import type { UntrustedDocument } from "~~/server/lib/contracts";

export const qualificationOutputSchema = z.object({
  verdict: z.enum(["STRONG_FIT", "POSSIBLE_FIT", "WEAK_FIT", "NOT_A_FIT"]),
  rationale: z.string(),
  matched_criteria: z.array(
    z.object({ criterion: z.string(), evidence: z.string(), claim_id: z.string().nullable() }),
  ),
  missing_criteria: z.array(z.string()),
  disqualifiers: z.array(z.string()),
  open_questions: z.array(z.string()),
  recommended_stage: z.enum(["QUALIFIED", "READY_FOR_OUTREACH", "COLD", "NOT_A_FIT"]),
  qualification_confidence: confidence,
});

export type QualificationOutput = z.infer<typeof qualificationOutputSchema>;
export const qualificationResponseSchema = jsonSchemaOf(qualificationOutputSchema);

const ROLE = `
You qualify B2B leads against an ideal customer profile for a consultant who
builds business automation systems. You are the sceptical voice in the room:
your job is to find the reason this is not worth pursuing, and to say so when
you find it. A confident "not a fit" is more valuable than a hedged maybe.
Judge only on the evidence supplied. Missing evidence is a missing criterion,
not a failure.
`;

export function buildQualificationRequest(input: {
  company: { name: string; industry?: string | null; location?: string | null; employeeCount?: number | null };
  icp?: {
    name: string;
    description?: string | null;
    industries: string[];
    geographies: string[];
    problems: string[];
    targetRoles: string[];
    minEmployees?: number | null;
    maxEmployees?: number | null;
    minDealSize?: number | null;
    maxDealSize?: number | null;
  } | null;
  research?: { summary?: string | null; claims: { id: string; type: string; text: string }[] } | null;
  signals?: { type: string; evidence: string }[];
  documents?: UntrustedDocument[];
}): AgentRequest {
  return {
    system: systemPrompt(ROLE),
    instruction: userTurn({
      task: [
        `Decide whether ${input.company.name} fits the ideal customer profile.`,
        "Reference claim ids from the research where they support a criterion.",
        "List every criterion you could not evaluate under missing_criteria.",
      ].join(" "),
      context: {
        company: input.company,
        ideal_customer_profile: input.icp ?? null,
        research_summary: input.research?.summary ?? null,
        research_claims: input.research?.claims ?? [],
        detected_signals: input.signals ?? [],
      },
    }),
    data: input.documents ?? [],
    responseSchema: qualificationResponseSchema,
    maxTokens: 4000,
  };
}
