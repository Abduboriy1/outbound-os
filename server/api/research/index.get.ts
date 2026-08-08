import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { readResearchPayload } from "~~/server/lib/research/types";

const listSchema = z.object({
  leadId: z.string().optional(),
  status: z.enum(["PENDING", "RUNNING", "COMPLETE", "FAILED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /**
   * `include=signals` adds `signalDetails`, the detected signals themselves.
   * `signals` stays the count it has always been, so existing callers — the
   * research queue reads it as a number — are unaffected. Without this the
   * signals page has to fetch every report's detail one request at a time.
   */
  include: z.string().optional(),
});

/** Latest reports for the signed-in user, newest first. */
export default route(async (event, { user }) => {
  const query = parseQuery(event, listSchema);

  const reports = await prisma.researchReport.findMany({
    where: {
      lead: { userId: user.id, deletedAt: null },
      ...(query.leadId ? { leadId: query.leadId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.limit,
    select: {
      id: true,
      leadId: true,
      status: true,
      summary: true,
      confidence: true,
      model: true,
      error: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      payload: true,
      company: { select: { id: true, name: true, domain: true } },
      _count: { select: { claims: true, sources: true } },
    },
  });

  const wantsSignals = query.include
    ?.split(",")
    .map((part) => part.trim())
    .includes("signals");

  return ok(
    reports.map((report) => {
      const { payload: rawPayload, ...rest } = report;
      const payload = readResearchPayload(rawPayload);
      return {
        ...rest,
        signals: payload?.signals.length ?? 0,
        // The research queue's per-lead progress row (plan §32) counts the
        // opportunities the run produced; `src/app/(app)/research/queue/page.tsx`
        // read it off the payload the same way.
        opportunities: payload?.opportunities.length ?? 0,
        warnings: payload?.warnings ?? [],
        ...(wantsSignals ? { signalDetails: payload?.signals ?? [] } : {}),
      };
    }),
  );
});
