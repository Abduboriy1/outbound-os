import { notFound, ok, route } from "~~/server/lib/api";
import { prisma } from "~~/server/lib/db";
import { readResearchPayload } from "~~/server/lib/research/types";

/** Full report: claims grouped by type, with their sources (plan §9). */
export default route(async (_event, { user, params }) => {
  const report = await prisma.researchReport.findFirst({
    where: { id: params.reportId, lead: { userId: user.id, deletedAt: null } },
    include: {
      company: { select: { id: true, name: true, domain: true, website: true } },
      sources: { orderBy: { retrievedAt: "asc" } },
      claims: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!report) notFound("Research report");

  const { payload: rawPayload, ...rest } = report;
  const payload = readResearchPayload(rawPayload);

  return ok({
    ...rest,
    claimsByType: {
      FACT: report.claims.filter((claim) => claim.type === "FACT"),
      INFERENCE: report.claims.filter((claim) => claim.type === "INFERENCE"),
      UNKNOWN: report.claims.filter((claim) => claim.type === "UNKNOWN"),
    },
    signals: payload?.signals ?? [],
    opportunities: payload?.opportunities ?? [],
    warnings: payload?.warnings ?? [],
  });
});
