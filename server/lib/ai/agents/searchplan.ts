/**
 * SearchPlanAgent — plans web searches the way a human researcher would.
 *
 * Runs early in the pipeline, after the company's own site has been read.
 * Given what was already found, it proposes the searches a person would type
 * next: the staff directory, "«company» leadership team", the LinkedIn page,
 * "«domain» email", local news. Each query carries its goal and reasoning, and
 * both are written to the run's step log so the operator can audit exactly why
 * the agent searched for what it searched for.
 *
 * The queries are executed by the search provider, never by the model — the
 * model only plans. No search key configured → this stage is skipped entirely.
 */

import { z } from "zod";
import type { AgentRequest } from "../prompt";
import { systemPrompt, userTurn } from "../prompt";
import { jsonSchemaOf } from "../schema";

export const searchPlanSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(2),
        /** What the search is trying to find; drives which section logs it. */
        goal: z.enum(["people", "company"]),
        /** One sentence of reasoning, shown verbatim in the activity log. */
        reason: z.string().min(1),
      }),
    )
    .max(8),
});

export type SearchPlan = z.infer<typeof searchPlanSchema>;

export const searchPlanResponseSchema = jsonSchemaOf(searchPlanSchema);

const ROLE = `
You plan web searches for a B2B researcher. You are given one company, what has
already been read about it, and what the researcher still needs: who works
there (names, titles, email addresses, phone numbers) and what the company does
and struggles with.

Think like a person at a search engine, not like an API. People find staff by
searching for the staff directory, the leadership or board page, the company's
LinkedIn, "«name» contact email", conference speaker lists, local business news.
Propose only searches that a search engine can actually answer, each with the
single thing it should turn up. Do not repeat ground already covered by the
pages listed as read. Fewer, sharper queries beat many vague ones.
`;

export function buildSearchPlanRequest(input: {
  company: {
    name: string;
    domain?: string | null;
    website?: string | null;
    industry?: string | null;
    location?: string | null;
  };
  /** Titles/URLs already fetched, so the plan does not re-cover them. */
  alreadyRead: string[];
  maxQueries: number;
}): AgentRequest {
  return {
    system: systemPrompt(ROLE),
    instruction: userTurn({
      task: [
        `Plan at most ${input.maxQueries} web searches for ${input.company.name}.`,
        "Cover both goals: 'people' searches that find named staff, emails and",
        "phone numbers, and 'company' searches that find what it does, recent",
        "news and signs of operational pain. Give each query its goal and a",
        "one-sentence reason.",
      ].join(" "),
      context: {
        company: input.company,
        already_read: input.alreadyRead,
      },
    }),
    data: [],
    responseSchema: searchPlanResponseSchema,
    maxTokens: 1200,
  };
}

/** Drops duplicate and empty queries; caps the count whatever the model says. */
export function normaliseSearchPlan(plan: SearchPlan, maxQueries: number): SearchPlan {
  const seen = new Set<string>();
  const queries = plan.queries.filter((entry) => {
    const key = entry.query.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { queries: queries.slice(0, maxQueries) };
}
