/**
 * Running a named agent for a lead.
 *
 * The API route and the UI both need "run the qualification agent on lead X"
 * without knowing how that agent's prompt is assembled, so the assembly lives
 * here and the route stays a thin authentication and validation layer.
 * Everything still goes through AIService, so every call is recorded.
 */

import type { AgentName } from "~~/server/lib/contracts";
import { prisma } from "~~/server/lib/db";
import { readResearchPayload } from "~~/server/lib/research/types";
import { aiService } from "./service";
import { buildQualificationRequest, qualificationOutputSchema } from "./agents/qualification";
import {
  buildOpportunityRequest,
  normaliseOpportunities,
  opportunityOutputSchema,
} from "./agents/opportunity";
import { buildDiscoveryRequest, discoveryOutputSchema } from "./agents/discovery";
import { buildSalesCoachRequest, salesCoachOutputSchema } from "./agents/salesCoach";

/** Agents this module can run directly. Research goes through the queue. */
export const LEAD_AGENTS = ["qualification", "opportunity", "discovery"] as const;
export type LeadAgent = (typeof LEAD_AGENTS)[number];

export function isLeadAgent(value: string): value is LeadAgent {
  return (LEAD_AGENTS as readonly string[]).includes(value);
}

export class AgentInputError extends Error {}

export async function runAgentForLead(options: {
  agent: LeadAgent;
  leadId: string;
  userId: string;
}) {
  const lead = await prisma.lead.findFirst({
    where: { id: options.leadId, userId: options.userId, deletedAt: null },
    include: { company: true, contact: true, icp: true },
  });
  if (!lead) throw new AgentInputError("Lead not found");

  const report = await prisma.researchReport.findFirst({
    where: { leadId: lead.id, status: "COMPLETE" },
    orderBy: { createdAt: "desc" },
    select: { payload: true, summary: true },
  });
  const payload = readResearchPayload(report?.payload);
  const claims = (payload?.report?.claims ?? []).map((claim) => ({
    id: claim.id,
    type: claim.type,
    text: claim.text,
    source_url: claim.source_url,
  }));
  const signals = (payload?.signals ?? []).map((signal) => ({
    type: signal.type,
    evidence: signal.evidence,
    sourceUrl: signal.sourceUrl,
  }));

  if (claims.length === 0) {
    throw new AgentInputError(
      "Run research for this lead first — there is no evidence for the agent to work from.",
    );
  }

  const service = aiService();
  const company = {
    name: lead.company.name,
    industry: lead.company.industry,
    location: lead.company.location,
    employeeCount: lead.company.employeeCount,
  };

  switch (options.agent) {
    case "qualification": {
      const run = await service.run({
        agent: "qualification" as AgentName,
        userId: options.userId,
        leadId: lead.id,
        schema: qualificationOutputSchema,
        request: buildQualificationRequest({
          company,
          icp: lead.icp
            ? {
                name: lead.icp.name,
                description: lead.icp.description,
                industries: lead.icp.industries,
                geographies: lead.icp.geographies,
                problems: lead.icp.problems,
                targetRoles: lead.icp.targetRoles,
                minEmployees: lead.icp.minEmployees,
                maxEmployees: lead.icp.maxEmployees,
                minDealSize: lead.icp.minDealSize,
                maxDealSize: lead.icp.maxDealSize,
              }
            : null,
          research: { summary: report?.summary ?? null, claims },
          signals: signals.map((s) => ({ type: s.type, evidence: s.evidence })),
        }),
      });
      return { agent: options.agent, runId: run.runId, data: run.data };
    }

    case "opportunity": {
      const run = await service.run({
        agent: "opportunity" as AgentName,
        userId: options.userId,
        leadId: lead.id,
        schema: opportunityOutputSchema,
        request: buildOpportunityRequest({ company, claims, signals }),
      });
      const normalised = normaliseOpportunities(
        run.data,
        claims.map((c) => c.id),
      );
      return { agent: options.agent, runId: run.runId, data: normalised };
    }

    case "discovery": {
      const opportunities = await prisma.opportunity.findMany({
        where: { leadId: lead.id },
        select: { title: true, problem: true, solution: true },
        take: 5,
      });
      const run = await service.run({
        agent: "discovery" as AgentName,
        userId: options.userId,
        leadId: lead.id,
        schema: discoveryOutputSchema,
        request: buildDiscoveryRequest({
          company,
          contact: lead.contact
            ? {
                firstName: lead.contact.firstName,
                lastName: lead.contact.lastName,
                title: lead.contact.title,
              }
            : null,
          claims,
          opportunities: opportunities.map((o) => ({
            title: o.title,
            problem: o.problem,
            possible_solution: o.solution,
          })),
        }),
      });

      // Questions are the point of the agent, so they are persisted rather than
      // left in the run output where nobody would see them again.
      const existing = await prisma.discoveryQuestion.findMany({
        where: { leadId: lead.id },
        select: { question: true },
      });
      const known = new Set(existing.map((q) => q.question.toLowerCase().trim()));
      const fresh = run.data.questions.filter(
        (q) => !known.has(q.question.toLowerCase().trim()),
      );
      if (fresh.length) {
        await prisma.discoveryQuestion.createMany({
          data: fresh.map((q) => ({
            leadId: lead.id,
            category: q.category,
            question: q.question,
            rationale: q.rationale,
          })),
        });
      }

      return { agent: options.agent, runId: run.runId, data: run.data };
    }
  }
}

/** The daily plan (plan §28). Aggregates first, then one model call. */
export async function runSalesCoach(userId: string) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const [goals, stages, dueTasks, contacted, freshLeads, meetings] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, isActive: true },
      include: { progress: { orderBy: { periodStart: "desc" }, take: 1 } },
    }),
    prisma.lead.groupBy({
      by: ["stage"],
      where: { userId, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.task.findMany({
      where: { userId, status: "OPEN", dueAt: { lte: endOfDay } },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, title: true, dueAt: true, leadId: true },
    }),
    prisma.lead.findMany({
      where: {
        userId,
        deletedAt: null,
        stage: "CONTACTED",
        lastContactedAt: { not: null },
      },
      orderBy: { lastContactedAt: "asc" },
      take: 10,
      select: { id: true, lastContactedAt: true, company: { select: { name: true } } },
    }),
    prisma.lead.findMany({
      where: { userId, deletedAt: null, stage: "RESEARCHING" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true, overallScore: true, company: { select: { name: true } } },
    }),
    prisma.meeting.findMany({
      where: { scheduledAt: { gte: startOfDay, lt: endOfDay }, lead: { userId } },
      select: { leadId: true, title: true, scheduledAt: true },
    }),
  ]);

  const run = await aiService().run({
    agent: "salesCoach" as AgentName,
    userId,
    schema: salesCoachOutputSchema,
    request: buildSalesCoachRequest({
      today: startOfDay.toISOString().slice(0, 10),
      goals: goals.map((goal) => ({
        metric: goal.metric,
        period: goal.period,
        target: goal.target,
        current: goal.progress[0]?.value ?? 0,
      })),
      pipeline: stages.map((row) => ({ stage: row.stage, count: row._count._all })),
      dueTasks: dueTasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt?.toISOString() ?? null,
        leadId: task.leadId,
      })),
      waitingReplies: contacted.map((lead) => ({
        leadId: lead.id,
        company: lead.company.name,
        daysSinceContact: lead.lastContactedAt
          ? Math.floor((now.getTime() - lead.lastContactedAt.getTime()) / 86_400_000)
          : 0,
      })),
      freshResearch: freshLeads.map((lead) => ({
        leadId: lead.id,
        company: lead.company.name,
        overallScore: lead.overallScore,
      })),
      meetings: meetings.map((meeting) => ({
        leadId: meeting.leadId,
        title: meeting.title,
        scheduledAt: meeting.scheduledAt.toISOString(),
      })),
    }),
  });

  return { agent: "salesCoach" as const, runId: run.runId, data: run.data };
}
