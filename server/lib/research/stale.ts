/**
 * Stale-lead detection (plan §34 background jobs).
 *
 * Leads go quiet silently: nothing errors, the row just stops moving. This job
 * makes that visible by raising one task per quiet lead, and by reporting which
 * research reports are old enough to be worth refreshing.
 *
 * It is idempotent — a lead that already has an open staleness task is skipped —
 * so it can run on a schedule without generating duplicates.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import { PIPELINE_STAGES } from "~~/shared/stages";

/** Days without activity before a lead counts as stale. */
export const STALE_AFTER_DAYS = 14;
/** Days before a completed research report is worth re-running. */
export const RESEARCH_STALE_AFTER_DAYS = 90;

const STALE_TASK_PREFIX = "Lead has gone quiet:";

export type StaleLeadResult = {
  staleLeads: number;
  tasksCreated: number;
  reportsToRefresh: { leadId: string; reportId: string; ageDays: number }[];
};

export async function detectStaleLeads(options: {
  userId: string;
  staleAfterDays?: number;
  researchStaleAfterDays?: number;
}): Promise<StaleLeadResult> {
  const staleAfter = options.staleAfterDays ?? STALE_AFTER_DAYS;
  const researchStaleAfter = options.researchStaleAfterDays ?? RESEARCH_STALE_AFTER_DAYS;
  const cutoff = daysAgo(staleAfter);

  // Stages where silence is a problem — a lead sitting in PROSPECT has simply
  // not been worked yet, and WON/LOST are finished.
  const activeStages = PIPELINE_STAGES.filter(
    (stage) => stage !== "PROSPECT" && stage !== "WON" && stage !== "CUSTOMER",
  );

  const stale = await prisma.lead.findMany({
    where: {
      userId: options.userId,
      deletedAt: null,
      stage: { in: activeStages },
      OR: [{ lastActivityAt: { lt: cutoff } }, { lastActivityAt: null, createdAt: { lt: cutoff } }],
    },
    select: {
      id: true,
      stage: true,
      lastActivityAt: true,
      createdAt: true,
      company: { select: { name: true } },
      tasks: {
        where: { status: "OPEN", title: { startsWith: STALE_TASK_PREFIX } },
        select: { id: true },
      },
    },
    take: 200,
  });

  let tasksCreated = 0;
  for (const lead of stale) {
    if (lead.tasks.length > 0) continue;
    const quietSince = lead.lastActivityAt ?? lead.createdAt;
    await prisma.task.create({
      data: {
        userId: options.userId,
        leadId: lead.id,
        title: `${STALE_TASK_PREFIX} ${lead.company.name}`,
        detail: `No activity since ${quietSince.toISOString().slice(0, 10)} while in ${lead.stage}. Follow up, or move the lead out of the pipeline.`,
        dueAt: new Date(),
        createdByAi: true,
      },
    });
    tasksCreated += 1;
  }

  const oldReports = await prisma.researchReport.findMany({
    where: {
      status: "COMPLETE",
      completedAt: { lt: daysAgo(researchStaleAfter) },
      lead: { userId: options.userId, deletedAt: null },
    },
    orderBy: { completedAt: "desc" },
    select: { id: true, leadId: true, completedAt: true },
    take: 50,
  });

  const reportsToRefresh = oldReports.map((report) => ({
    leadId: report.leadId,
    reportId: report.id,
    ageDays: report.completedAt
      ? Math.floor((Date.now() - report.completedAt.getTime()) / 86_400_000)
      : researchStaleAfter,
  }));

  if (tasksCreated > 0 || reportsToRefresh.length > 0) {
    await audit({
      userId: options.userId,
      actorType: "SYSTEM",
      action: "leads.stale_detected",
      entityType: "Lead",
      metadata: {
        staleLeads: stale.length,
        tasksCreated,
        reportsToRefresh: reportsToRefresh.length,
      },
    });
  }

  return { staleLeads: stale.length, tasksCreated, reportsToRefresh };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000);
}
