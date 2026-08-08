import { ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { classifyFollowUp } from "~~/server/lib/outreach/followups";

/** Leads flagged NO NEXT ACTION / OVERDUE / STALE (plan §22). */
export default route(async (_event, { user }) => {
  const leads = await prisma.lead.findMany({
    where: { userId: user.id, deletedAt: null },
    select: {
      id: true,
      stage: true,
      nextAction: true,
      nextActionDueAt: true,
      lastActivityAt: true,
      lastContactedAt: true,
      createdAt: true,
      company: { select: { name: true } },
    },
  });

  const now = new Date();
  const assessed = leads
    .map((lead) => ({
      leadId: lead.id,
      company: lead.company.name,
      ...classifyFollowUp(lead, now),
    }))
    .filter((entry) => entry.flags.length > 0)
    .sort((a, b) => b.urgency - a.urgency);

  return ok(assessed);
});
