/**
 * SalesCoachAgent (plan §28).
 *
 * The morning plan: what to do today, in order, and why. It works from
 * aggregates the caller computes — never from raw pipeline rows — so the model
 * cannot invent a lead that does not exist.
 */

import { z } from "zod";
import type { AgentRequest } from "../prompt";
import { systemPrompt, userTurn } from "../prompt";
import { jsonSchemaOf } from "../schema";

export const salesCoachOutputSchema = z.object({
  headline: z.string(),
  priorities: z.array(
    z.object({
      rank: z.number().int().min(1),
      action: z.string(),
      reason: z.string(),
      lead_id: z.string().nullable(),
    }),
  ),
  pipeline_observation: z.string(),
  goal_status: z.array(
    z.object({
      metric: z.string(),
      current: z.number(),
      target: z.number(),
      comment: z.string(),
    }),
  ),
  risks: z.array(z.string()),
});

export type SalesCoachOutput = z.infer<typeof salesCoachOutputSchema>;
export const salesCoachResponseSchema = jsonSchemaOf(salesCoachOutputSchema);

const ROLE = `
You are the consultant's daily sales coach. Produce today's plan: at most five
priorities, ranked, each tied to something real in the supplied data. Reference
leads only by the ids given to you. The pipeline observation should name one
pattern worth changing this week, with the number that shows it — not general
encouragement. If the data is thin, say what is missing instead of padding.
`;

export function buildSalesCoachRequest(input: {
  today: string;
  goals: { metric: string; period: string; target: number; current: number }[];
  pipeline: { stage: string; count: number }[];
  dueTasks: { id: string; title: string; dueAt: string | null; leadId: string | null }[];
  waitingReplies: { leadId: string; company: string; daysSinceContact: number }[];
  freshResearch: { leadId: string; company: string; overallScore: number | null }[];
  meetings: { leadId: string | null; title: string; scheduledAt: string }[];
  funnel?: { repliesRate: number; discoveryRate: number } | null;
}): AgentRequest {
  return {
    system: systemPrompt(ROLE),
    instruction: userTurn({
      task: "Write today's sales plan from the figures below.",
      context: input,
    }),
    responseSchema: salesCoachResponseSchema,
    maxTokens: 3000,
  };
}
