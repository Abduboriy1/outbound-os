import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import type { Prisma } from "~~/server/generated/prisma/client";

/**
 * Meetings for the signed-in user's leads.
 *
 * Port of the two `prisma.meeting.findMany` calls in
 * `src/app/(app)/deals/discovery/page.tsx` plus the `prisma.meeting.count` in
 * `loadDailyQueue` (`server/lib/analytics/dashboard.ts`). The Next page ran
 * those as two server-component queries; a single endpoint answers both because
 * the only difference between them was the `scheduledAt` comparison and the
 * sort direction.
 *
 * The include is the union of the source's two includes, so one row carries
 * everything either list rendered: `contact` (only the upcoming query selected
 * it) and the newest `summaries` row (only the past query selected it).
 */
const querySchema = z.object({
  /** `upcoming` = the source's first query, `past` = its second, `all` = both. */
  scope: z.enum(["upcoming", "past", "all"]).catch("all").default("all"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  take: z.coerce.number().int().min(1).max(200).default(25),
});

const include = {
  lead: { select: { id: true, stage: true } },
  company: { select: { name: true } },
  contact: { select: { firstName: true, lastName: true, title: true } },
  summaries: {
    select: { id: true, summary: true },
    take: 1,
    orderBy: { createdAt: "desc" },
  },
} satisfies Prisma.MeetingInclude;

export default route(async (event, { user }) => {
  const query = parseQuery(event, querySchema);
  const now = new Date();
  const ownedLead = { userId: user.id, deletedAt: null };

  const [upcoming, past] = await Promise.all([
    query.scope === "past"
      ? Promise.resolve([])
      : prisma.meeting.findMany({
          where: {
            lead: ownedLead,
            scheduledAt: {
              gte: query.from ?? now,
              ...(query.to ? { lt: query.to } : {}),
            },
          },
          orderBy: { scheduledAt: "asc" },
          take: query.take,
          include,
        }),
    query.scope === "upcoming"
      ? Promise.resolve([])
      : prisma.meeting.findMany({
          where: {
            lead: ownedLead,
            scheduledAt: {
              lt: query.to ?? now,
              ...(query.from ? { gte: query.from } : {}),
            },
          },
          orderBy: { scheduledAt: "desc" },
          take: query.take,
          include,
        }),
  ]);

  return ok([...upcoming, ...past]);
});
