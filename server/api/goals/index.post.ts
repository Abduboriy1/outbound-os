import { z } from "zod";
import { ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { snapshotGoalProgress } from "~~/server/lib/goals/queries";

const upsertSchema = z.object({
  metric: z.enum([
    "COMPANIES_RESEARCHED",
    "CONTACTS_IDENTIFIED",
    "OUTREACH_SENT",
    "FOLLOW_UPS_SENT",
    "REPLIES",
    "CONVERSATIONS",
    "DISCOVERY_CALLS",
    "PROPOSALS",
    "DEALS_WON",
  ]),
  period: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"]),
  target: z.number().int().min(1).max(100_000),
  isActive: z.boolean().optional(),
});

export default route(async (event, { user }) => {
  const body = await parseBody(event, upsertSchema);
  const goal = await prisma.goal.upsert({
    where: {
      userId_metric_period: {
        userId: user.id,
        metric: body.metric,
        period: body.period,
      },
    },
    create: {
      userId: user.id,
      metric: body.metric,
      period: body.period,
      target: body.target,
      isActive: body.isActive ?? true,
    },
    update: { target: body.target, isActive: body.isActive ?? true },
  });

  await audit({
    userId: user.id,
    action: "goal.saved",
    entityType: "Goal",
    entityId: goal.id,
    metadata: { metric: body.metric, period: body.period, target: body.target },
  });

  const progress = await snapshotGoalProgress(user.id);
  return ok(progress.find((g) => g.id === goal.id) ?? goal, { status: 201 });
});
