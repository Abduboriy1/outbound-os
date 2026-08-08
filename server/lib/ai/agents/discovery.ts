/**
 * DiscoveryAgent (plan §19).
 *
 * Produces the pre-call brief and the questions to ask on the call. Questions
 * are specific to this company — a generic list is worse than none, because it
 * signals that nobody read the research.
 */

import { z } from "zod";
import type { AgentRequest } from "../prompt";
import { systemPrompt, userTurn } from "../prompt";
import { jsonSchemaOf } from "../schema";
import type { UntrustedDocument } from "~~/server/lib/contracts";

export const QUESTION_CATEGORIES = [
  "CURRENT_PROCESS",
  "TIME_COST",
  "PROBLEMS",
  "BUSINESS_IMPACT",
  "EXISTING_ATTEMPTS",
  "PURCHASE_PROCESS",
] as const;

export const discoveryOutputSchema = z.object({
  brief: z.object({
    company_summary: z.string(),
    contact_summary: z.string(),
    known_problems: z.array(z.string()),
    likely_problems: z.array(z.string()),
    research_evidence: z.array(
      z.object({ claim_id: z.string().nullable(), text: z.string() }),
    ),
    potential_opportunities: z.array(z.string()),
    possible_objections: z.array(z.string()),
    goals_for_call: z.array(z.string()),
  }),
  questions: z.array(
    z.object({
      category: z.enum(QUESTION_CATEGORIES),
      question: z.string(),
      rationale: z.string(),
    }),
  ),
});

export type DiscoveryOutput = z.infer<typeof discoveryOutputSchema>;
export const discoveryResponseSchema = jsonSchemaOf(discoveryOutputSchema);

const ROLE = `
You prepare a consultant for a discovery call. Two deliverables: a brief they
can read in ninety seconds, and questions written for this company in
particular. Separate what the research established (known_problems) from what
you suspect (likely_problems) — the consultant will ask about the second and
assert the first, so mixing them is expensive. Questions should be open, short,
and answerable by an operations person, not a procurement form.
`;

export function buildDiscoveryRequest(input: {
  company: { name: string; industry?: string | null; employeeCount?: number | null };
  contact?: { firstName: string; lastName?: string | null; title?: string | null } | null;
  claims: { id: string; type: string; text: string }[];
  opportunities: { title: string; problem: string; possible_solution?: string }[];
  priorMessages?: UntrustedDocument[];
}): AgentRequest {
  return {
    system: systemPrompt(ROLE),
    instruction: userTurn({
      task: [
        `Prepare the pre-call brief and discovery questions for ${input.company.name}.`,
        `Cover every category: ${QUESTION_CATEGORIES.join(", ")}.`,
        "Two to four questions per category.",
      ].join(" "),
      context: {
        company: input.company,
        contact: input.contact ?? null,
        research_claims: input.claims,
        opportunities: input.opportunities,
      },
    }),
    // Prior emails are prospect-written: untrusted, same as scraped pages.
    data: input.priorMessages ?? [],
    responseSchema: discoveryResponseSchema,
    maxTokens: 4000,
  };
}
