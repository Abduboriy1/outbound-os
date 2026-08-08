/**
 * OpportunityAgent (plan §11).
 *
 * Turns evidence into a concrete proposition: the problem, a possible
 * solution, the potential benefit, a confidence, and the claim ids the whole
 * thing rests on. This is what outreach is built from, so an opportunity with
 * no supporting evidence is worthless — the schema forces the citation.
 */

import { z } from "zod";
import type { AgentRequest } from "../prompt";
import { systemPrompt, userTurn } from "../prompt";
import { confidence, jsonSchemaOf } from "../schema";

export const opportunitySchema = z.object({
  title: z.string(),
  problem: z.string(),
  possible_solution: z.string(),
  potential_benefit: z.string(),
  opportunity_confidence: confidence,
  /** Claim ids from the research report, plus the source they came from. */
  supporting_evidence: z.array(
    z.object({
      claim_id: z.string().nullable(),
      source_url: z.string().nullable(),
      note: z.string(),
    }),
  ),
  estimated_value_min: z.number().nullable(),
  estimated_value_max: z.number().nullable(),
});

export const opportunityOutputSchema = z.object({
  opportunities: z.array(opportunitySchema),
  summary: z.string(),
});

export type Opportunity = z.infer<typeof opportunitySchema>;
export type OpportunityOutput = z.infer<typeof opportunityOutputSchema>;
export const opportunityResponseSchema = jsonSchemaOf(opportunityOutputSchema);

const ROLE = `
You convert research evidence into automation opportunities for a consultant
who builds reporting pipelines, internal tools, integrations, and dashboards.

Rules that matter more than polish:
  - One opportunity per distinct operational problem. Two or three is a good
    answer; eight is padding.
  - Every opportunity cites the claim ids it rests on. No evidence, no
    opportunity.
  - Describe the problem in the prospect's language, taken from their own
    material, not in vendor language.
  - Confidence reflects the evidence, not your enthusiasm. Hypotheses drawn
    from a single job advert sit around 0.4, not 0.9.
  - Leave estimated values null unless the sources support a number.
`;

export function buildOpportunityRequest(input: {
  company: { name: string; industry?: string | null; employeeCount?: number | null };
  claims: { id: string; type: string; text: string; source_url?: string | null }[];
  signals: { type: string; evidence: string; sourceUrl?: string }[];
  offering?: string;
  caseStudies?: { title: string; industry: string; problem: string; businessResult: string }[];
}): AgentRequest {
  return {
    system: systemPrompt(ROLE),
    instruction: userTurn({
      task: [
        `Generate the automation opportunities for ${input.company.name}.`,
        "Use the claim ids exactly as given in supporting_evidence.",
      ].join(" "),
      context: {
        company: input.company,
        research_claims: input.claims,
        detected_signals: input.signals,
        what_we_sell:
          input.offering ??
          "Custom business automation: reporting pipelines, internal tools, system integrations, dashboards.",
        comparable_work: input.caseStudies ?? [],
      },
    }),
    responseSchema: opportunityResponseSchema,
    maxTokens: 4000,
  };
}

/** Drops evidence pointing at claim ids that do not exist (plan §9). */
export function normaliseOpportunities(
  output: OpportunityOutput,
  knownClaimIds: string[],
): OpportunityOutput {
  const known = new Set(knownClaimIds);
  return {
    ...output,
    opportunities: output.opportunities.map((opportunity) => ({
      ...opportunity,
      supporting_evidence: opportunity.supporting_evidence.map((evidence) => ({
        ...evidence,
        claim_id: evidence.claim_id && known.has(evidence.claim_id) ? evidence.claim_id : null,
      })),
    })),
  };
}
