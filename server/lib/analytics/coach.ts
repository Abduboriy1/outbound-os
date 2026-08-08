import { z } from "zod";
import { aiService } from "~~/server/lib/ai";
import { systemPrompt, userTurn, type AgentRequest } from "~~/server/lib/ai/prompt";
import { jsonSchemaOf } from "~~/server/lib/ai/schema";
import {
  buildSalesCoachRequest,
  salesCoachOutputSchema,
  type SalesCoachOutput,
} from "~~/server/lib/ai/agents/salesCoach";
import { prisma } from "~~/server/lib/db";
import { GOAL_METRIC_LABELS } from "~~/server/lib/goals/progress";
import { loadGoalsWithProgress } from "~~/server/lib/goals/queries";
import { periodRange, previousPeriodRange } from "~~/shared/goals/periods";
import { loadAnalyticsLeads, loadOutreachRows, buildAnalyticsReport } from "./queries";

/**
 * The AI daily plan (plan §28) and weekly review (plan §29).
 *
 * Both run the salesCoach agent through AIService, which means both are
 * recorded as AiRun rows, validated against a Zod schema before anything is
 * rendered, and never auto-actioned. The model only ever sees aggregates the
 * app computed — counts, rates, goal progress — so it cannot invent a lead.
 */

export const weeklyReviewOutputSchema = z.object({
  what_worked: z.array(z.string()),
  what_did_not_work: z.array(z.string()),
  best_icp: z.string(),
  responsive_industries: z.array(z.string()),
  messages_that_produced_replies: z.array(z.string()),
  where_deals_stalled: z.string(),
  most_common_objection: z.string(),
  changes_for_next_week: z.array(z.string()),
});

export type WeeklyReviewOutput = z.infer<typeof weeklyReviewOutputSchema>;

const WEEKLY_ROLE = `
You are the consultant's weekly sales reviewer. Answer only from the figures
supplied. Where the data does not support an answer, say so plainly rather than
guessing. Every claim that involves a number must quote that number. Recommend
at most three changes for next week, each tied to a figure that justifies it.
`;

function buildWeeklyReviewRequest(context: Record<string, unknown>): AgentRequest {
  return {
    system: systemPrompt(WEEKLY_ROLE),
    instruction: userTurn({
      task: "Write this week's sales review from the figures below.",
      context,
    }),
    responseSchema: jsonSchemaOf(weeklyReviewOutputSchema),
    maxTokens: 3000,
  };
}

export type CoachRun<T> = {
  data: T;
  runId: string;
  model: string | null;
  generatedAt: Date;
};

/**
 * Reads back the most recent successful salesCoach run whose output matches the
 * given schema. Daily plans and weekly reviews share the agent name, so the
 * schema is what tells them apart — a stale or malformed row simply fails to
 * parse and is skipped.
 */
async function latestRun<T>(
  userId: string,
  schema: z.ZodType<T>,
  since: Date,
): Promise<CoachRun<T> | null> {
  const runs = await prisma.aiRun.findMany({
    where: { userId, agent: "salesCoach", status: "SUCCESS", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, output: true, model: true, createdAt: true },
  });

  for (const run of runs) {
    const parsed = schema.safeParse(run.output);
    if (parsed.success) {
      return {
        data: parsed.data,
        runId: run.id,
        model: run.model,
        generatedAt: run.createdAt,
      };
    }
  }
  return null;
}

export function getDailyObservation(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000);
  return latestRun(userId, salesCoachOutputSchema, since);
}

export function getWeeklyReview(userId: string, now = new Date()) {
  return latestRun(userId, weeklyReviewOutputSchema, periodRange("WEEKLY", now).start);
}

/** Gathers the aggregates the daily plan is written from. */
async function dailyContext(userId: string, now: Date) {
  const [goals, pipeline, dueTasks, waiting, fresh, meetings, leads] = await Promise.all([
    loadGoalsWithProgress(userId, now),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { userId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { userId, status: "OPEN", dueAt: { lte: now } },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, title: true, dueAt: true, leadId: true },
    }),
    prisma.lead.findMany({
      where: { userId, deletedAt: null, stage: "RESPONDED" },
      orderBy: { lastContactedAt: "asc" },
      take: 10,
      select: { id: true, lastContactedAt: true, company: { select: { name: true } } },
    }),
    prisma.lead.findMany({
      where: { userId, deletedAt: null, stage: { in: ["QUALIFIED", "READY_FOR_OUTREACH"] } },
      orderBy: { overallScore: "desc" },
      take: 10,
      select: { id: true, overallScore: true, company: { select: { name: true } } },
    }),
    prisma.meeting.findMany({
      where: {
        lead: { userId, deletedAt: null },
        scheduledAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) },
      },
      orderBy: { scheduledAt: "asc" },
      take: 10,
      select: { leadId: true, title: true, scheduledAt: true },
    }),
    loadAnalyticsLeads(userId),
  ]);

  const outreach = await loadOutreachRows(userId);
  const report = buildAnalyticsReport(leads, outreach);

  return {
    today: now.toISOString().slice(0, 10),
    goals: goals.map((goal) => ({
      metric: GOAL_METRIC_LABELS[goal.metric],
      period: goal.period,
      target: goal.target,
      current: goal.progress.value,
    })),
    pipeline: pipeline.map((row) => ({ stage: row.stage, count: row._count._all })),
    dueTasks: dueTasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt?.toISOString() ?? null,
      leadId: task.leadId,
    })),
    waitingReplies: waiting.map((lead) => ({
      leadId: lead.id,
      company: lead.company.name,
      daysSinceContact: lead.lastContactedAt
        ? Math.floor((now.getTime() - lead.lastContactedAt.getTime()) / 86_400_000)
        : 0,
    })),
    freshResearch: fresh.map((lead) => ({
      leadId: lead.id,
      company: lead.company.name,
      overallScore: lead.overallScore,
    })),
    meetings: meetings.map((meeting) => ({
      leadId: meeting.leadId,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt.toISOString(),
    })),
    funnel: {
      repliesRate: report.outreach.replyRate,
      discoveryRate:
        report.funnel.find((s) => s.key === "DISCOVERY")?.conversionFromPrevious ?? 0,
    },
  };
}

/** Runs the daily coach. Returns null if the model call fails — never throws. */
export async function generateDailyObservation(
  userId: string,
  now = new Date(),
): Promise<CoachRun<SalesCoachOutput> | null> {
  try {
    const context = await dailyContext(userId, now);
    const result = await aiService().run({
      agent: "salesCoach",
      userId,
      request: buildSalesCoachRequest(context),
      schema: salesCoachOutputSchema,
    });
    return {
      data: result.data,
      runId: result.runId,
      model: result.model,
      generatedAt: now,
    };
  } catch (error) {
    console.error("[coach] daily observation failed", error);
    return null;
  }
}

export async function generateWeeklyReview(
  userId: string,
  now = new Date(),
): Promise<CoachRun<WeeklyReviewOutput> | null> {
  try {
    const thisWeek = periodRange("WEEKLY", now);
    const lastWeek = previousPeriodRange("WEEKLY", now);

    const [current, previous, outreach] = await Promise.all([
      loadAnalyticsLeads(userId, thisWeek),
      loadAnalyticsLeads(userId, lastWeek),
      loadOutreachRows(userId, thisWeek),
    ]);
    const report = buildAnalyticsReport(current, outreach);

    const objections = await prisma.emailMessage.findMany({
      where: {
        direction: "INBOUND",
        sentAt: { gte: thisWeek.start, lt: thisWeek.end },
        thread: { lead: { userId, deletedAt: null } },
      },
      select: { objections: true },
      take: 200,
    });

    const result = await aiService().run({
      agent: "salesCoach",
      userId,
      request: buildWeeklyReviewRequest({
        weekStart: thisWeek.start.toISOString().slice(0, 10),
        weekEnd: thisWeek.end.toISOString().slice(0, 10),
        leadsCreatedThisWeek: current.length,
        leadsCreatedLastWeek: previous.length,
        outreach: report.outreach,
        funnel: report.funnel.map((step) => ({
          step: step.label,
          count: step.count,
          conversionFromPrevious: step.conversionFromPrevious,
        })),
        weakestTransition: report.weakest?.label ?? null,
        revenue: report.revenue,
        byIcp: report.byIcp.slice(0, 8),
        byIndustry: report.byIndustry.slice(0, 8),
        byProblem: report.byProblem.slice(0, 8),
        lossReasons: report.lossReasons.slice(0, 8),
        // Objection text is prospect-written. It is included as structured
        // context only after being reduced to short labels by the reply agent.
        objections: objections.flatMap((m) => m.objections).slice(0, 40),
      }),
      schema: weeklyReviewOutputSchema,
    });

    return {
      data: result.data,
      runId: result.runId,
      model: result.model,
      generatedAt: now,
    };
  } catch (error) {
    console.error("[coach] weekly review failed", error);
    return null;
  }
}
