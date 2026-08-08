import { HttpError, notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { enqueue } from "~~/server/lib/queue";

/** Re-runs research into this report (plan §32: research must be re-runnable). */
export default route(async (_event, { user, params }) => {
  const report = await prisma.researchReport.findFirst({
    where: { id: params.reportId, lead: { userId: user.id, deletedAt: null } },
    select: { id: true, leadId: true, status: true },
  });
  if (!report) notFound("Research report");
  if (report.status === "RUNNING") {
    throw new HttpError("This report is already running", 409);
  }

  const queued = await enqueue("research", {
    leadId: report.leadId,
    userId: user.id,
    reportId: report.id,
  });

  return ok({ reportId: report.id, mode: queued.mode, error: queued.error ?? null }, { status: 202 });
});
