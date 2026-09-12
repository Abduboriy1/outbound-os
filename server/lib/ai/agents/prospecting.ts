/**
 * ProspectingAgent (plan §8) — the lead finder.
 *
 * This is the only agent that runs in two calls, and the split is the whole
 * design:
 *
 *   1. `buildProspectingSearch` produces a grounded search. The provider runs
 *      real Google searches and answers from pages it actually read. A model
 *      asked to "list companies" from memory invents them, with plausible
 *      domains that resolve to nothing — that failure mode is why the HTTP
 *      search provider refuses to guess URLs, and it is not reintroduced here.
 *   2. `buildProspectExtractionRequest` structures that answer into lead rows.
 *      The searched text is passed as an untrusted document, because it is
 *      assembled from pages nobody vetted (plan §36).
 *
 * Nothing this agent returns is trusted on its own: every candidate is checked
 * against the citations before a human ever sees it (`server/lib/leads/prospect.ts`).
 */

import { z } from "zod";
import type { UntrustedDocument } from "~~/server/lib/contracts";
import type { AgentRequest } from "../prompt";
import { systemPrompt, userTurn } from "../prompt";
import { confidence, jsonSchemaOf } from "../schema";

export type ProspectingIcp = {
  name: string;
  description?: string | null;
  industries: string[];
  geographies: string[];
  problems: string[];
  targetRoles: string[];
  minEmployees?: number | null;
  maxEmployees?: number | null;
};

/* ------------------------------------------------------- 1. grounded search */

const SEARCH_ROLE = `
You find real businesses that a B2B consultant could approach, using web search.

Rules you never break:
- Every company you name must come from a page you actually retrieved in this
  search. If you did not find it, do not name it.
- Give each company's own website domain, copied from the page you found, never
  guessed or reconstructed from the company name.
- If the search returns fewer companies than asked for, return fewer. A short,
  real list is the correct answer; padding it with plausible names is not.
- Prefer directories, trade bodies, local business press, and job listings.
  Those name many companies at once and are current.
- Say plainly when a detail (headcount, location) was not on the page.
`;

/**
 * The grounded half. Free text, not structured — the search tool and a response
 * schema cannot be combined, so this reads as instructions to a researcher.
 */
export function buildProspectingSearch(input: {
  icp?: ProspectingIcp | null;
  count: number;
  /** Operator's own words, narrowing this run. */
  criteria?: string | null;
  /** Companies already in the pipeline, so the search does not re-find them. */
  excludeDomains?: string[];
}) {
  const icp = input.icp;
  const lines: string[] = [
    `Find up to ${input.count} real companies that match the profile below, then list them.`,
    "",
    "Profile:",
  ];

  if (icp) {
    lines.push(`- Ideal customer profile: ${icp.name}`);
    if (icp.description) lines.push(`- Description: ${icp.description}`);
    if (icp.industries.length) lines.push(`- Industries: ${icp.industries.join(", ")}`);
    if (icp.geographies.length) lines.push(`- Locations: ${icp.geographies.join(", ")}`);
    if (icp.problems.length) {
      lines.push(`- Operational problems they are likely to have: ${icp.problems.join("; ")}`);
    }
    if (icp.minEmployees || icp.maxEmployees) {
      lines.push(
        `- Headcount: ${icp.minEmployees ?? "any"} to ${icp.maxEmployees ?? "any"} employees`,
      );
    }
    if (icp.targetRoles.length) {
      lines.push(`- People worth reaching there: ${icp.targetRoles.join(", ")}`);
    }
  } else {
    lines.push("- No ideal customer profile is configured; use the criteria below alone.");
  }

  if (input.criteria?.trim()) {
    lines.push(`- Additional criteria from the operator: ${input.criteria.trim()}`);
  }

  if (input.excludeDomains?.length) {
    lines.push(
      "",
      "Already known, so do not return these domains:",
      input.excludeDomains.slice(0, 100).join(", "),
    );
  }

  lines.push(
    "",
    "For each company give: name, website domain, what it does, where it is based,",
    "rough headcount if the page stated one, and the URL of the page you found it on.",
  );

  return { system: systemPrompt(SEARCH_ROLE), instruction: lines.join("\n") };
}

/* --------------------------------------------- 1b. query plan (search API) */

export const queryPlanOutputSchema = z.object({
  queries: z.array(z.string().min(3).max(200)).min(1).max(8),
});

export type QueryPlanOutput = z.infer<typeof queryPlanOutputSchema>;

const PLANNER_ROLE = `
You turn an ideal customer profile into web search queries that will surface
lists of real companies.

What works: directory and trade-association pages, "top N suppliers in <place>"
roundups, local business awards, job boards. Those name many companies at once.
What does not work: asking a search engine a question, or searching for the
problem in the abstract — that returns vendors selling a fix, not the businesses
that have it.

Vary the angle across queries rather than rewording one idea. Write queries as a
person would type them, with no boolean operators or site: filters.
`;

/**
 * The search-API path's first call. Plain generation, no tools — this is the
 * step that replaces the query planning a grounded provider does internally.
 */
export function buildQueryPlanRequest(input: {
  icp?: ProspectingIcp | null;
  criteria?: string | null;
  count: number;
}): AgentRequest {
  return {
    system: systemPrompt(PLANNER_ROLE),
    instruction: userTurn({
      task: [
        `Write up to ${Math.min(6, Math.max(2, Math.ceil(input.count / 2)))} search queries that`,
        "would surface companies matching the profile below. Each query should attack",
        "the problem from a different angle.",
      ].join(" "),
      context: {
        icp: input.icp
          ? {
              name: input.icp.name,
              industries: input.icp.industries,
              geographies: input.icp.geographies,
              problems: input.icp.problems,
              minEmployees: input.icp.minEmployees,
              maxEmployees: input.icp.maxEmployees,
            }
          : null,
        criteria: input.criteria ?? null,
      },
    }),
    responseSchema: jsonSchemaOf(queryPlanOutputSchema),
    maxTokens: 1_000,
  };
}

/* ---------------------------------------------------- 2. structured extract */

export const prospectingOutputSchema = z.object({
  companies: z.array(
    z.object({
      name: z.string(),
      /** Bare hostname. Verified against the citations before it is offered. */
      domain: z.string().nullable(),
      industry: z.string().nullable(),
      location: z.string().nullable(),
      employee_count: z.number().int().positive().max(10_000_000).nullable(),
      description: z.string().nullable(),
      /** Why this company fits the profile, in terms the operator can argue with. */
      match_reason: z.string(),
      /** The page this company was found on. */
      source_url: z.string().nullable(),
      match_confidence: confidence,
    }),
  ),
  /** Anything the search could not establish — shown to the operator as-is. */
  notes: z.array(z.string()),
});

export type ProspectingOutput = z.infer<typeof prospectingOutputSchema>;
export const prospectingResponseSchema = jsonSchemaOf(prospectingOutputSchema);

const EXTRACT_ROLE = `
You convert the results of a web search into structured company records.

You are transcribing, not researching. Every field must come from the supplied
search results. Copy domains exactly as they appear. Use null for anything the
text does not state — never fill a gap with a plausible value, and never add a
company the text does not mention.
`;

export function buildProspectExtractionRequest(input: {
  /**
   * The retrieved material: one summary from a grounded provider, or one entry
   * per page when the search API path fetched them itself. Either way these are
   * pages nobody vetted, so they travel as untrusted documents.
   */
  documents: UntrustedDocument[];
  citations: { url: string; title?: string; domain?: string }[];
  icp?: ProspectingIcp | null;
  count: number;
}): AgentRequest {
  const citationList = input.citations
    .slice(0, 40)
    .map((c) => `- ${c.domain ?? "unknown domain"} — ${c.title ?? "untitled"} (${c.url})`)
    .join("\n");

  return {
    system: systemPrompt(EXTRACT_ROLE),
    instruction: userTurn({
      task: [
        `Extract up to ${input.count} companies from the pages below.`,
        "",
        "A page that lists many companies — a directory, a members list, a roundup —",
        "is the point: take every company on it that fits the profile, not just the",
        "first. Ignore the site hosting the list unless it fits the profile itself.",
        "",
        "For each company, set `match_reason` to why it fits, quoting what the page",
        "actually said. Set `source_url` to the page it came from. Where no domain",
        "appears for a company, set `domain` to null rather than inventing one — a",
        "company with no domain is dropped, which is correct.",
        "",
        "Pages retrieved:",
        citationList || "- (none reported)",
      ].join("\n"),
      context: {
        icp: input.icp
          ? {
              name: input.icp.name,
              industries: input.icp.industries,
              geographies: input.icp.geographies,
              problems: input.icp.problems,
            }
          : null,
      },
    }),
    // Carried on `data`, not folded into the instruction by `userTurn`. Both
    // routes wrap the text, but only this one passes through AIService, which
    // is where sanitisation and injection detection actually happen.
    data: input.documents,
    responseSchema: prospectingResponseSchema,
    maxTokens: 8_000,
  };
}
