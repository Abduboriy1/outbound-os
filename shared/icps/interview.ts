import { z } from "zod";

/**
 * The AI-assisted ICP interview contract (plan §7).
 *
 * In the Next app these lived in the route module itself
 * (`src/app/api/icps/interview/route.ts`) and were imported straight into the
 * React page. A Nitro route file cannot be imported from the browser bundle, so
 * the question list and the draft schema were lifted into `shared/`, which both
 * sides can read.
 */

export const INTERVIEW_QUESTIONS = [
  {
    id: "offering",
    question: "What do you build for clients, in one or two sentences?",
    hint: "Automations, internal tools, integrations, dashboards.",
  },
  {
    id: "bestClients",
    question: "Which past clients were the best fit, and what did they have in common?",
    hint: "Industry, size, how they worked before you arrived.",
  },
  {
    id: "problems",
    question: "What operational problems do you solve most often?",
    hint: "Spreadsheet processes, rekeying data, manual reporting, disconnected systems.",
  },
  {
    id: "buyers",
    question: "Who signs off on this work, and who else is involved?",
    hint: "Owner, COO, VP Operations, IT lead.",
  },
  {
    id: "geography",
    question: "Where are the clients you can realistically serve?",
    hint: "Countries, regions, time zones.",
  },
  {
    id: "dealSize",
    question: "What does a typical engagement cost, from smallest to largest?",
  },
  {
    id: "disqualifiers",
    question: "What makes a company a bad fit, however interested they seem?",
  },
] as const;

export const icpDraftSchema = z.object({
  name: z.string(),
  description: z.string(),
  industries: z.array(z.string()),
  geographies: z.array(z.string()),
  problems: z.array(z.string()),
  target_roles: z.array(z.string()),
  min_employees: z.number().int().nullable(),
  max_employees: z.number().int().nullable(),
  min_deal_size: z.number().int().nullable(),
  max_deal_size: z.number().int().nullable(),
  disqualifiers: z.array(z.string()),
  /** Why the draft looks like this, so the user can argue with it. */
  rationale: z.string(),
  /** What the answers did not cover; the user fills these in themselves. */
  open_questions: z.array(z.string()),
});

export type IcpDraft = z.infer<typeof icpDraftSchema>;
