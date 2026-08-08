import { z } from "zod";
import { notFound, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";

/**
 * Port of `saveRoiAction` (`src/app/(app)/opportunities/actions.ts`).
 *
 * Persists the ROI inputs, not the derived figures (plan §25). Storing the
 * inputs means the arithmetic can be corrected later without every saved
 * estimate carrying an old formula, and `prospectSupplied` records whether
 * these numbers came from the buyer or are our own estimate.
 *
 * The schema is the source's `roiSchema` with two widenings, both forced by the
 * move from `FormData` to JSON: `projectCost` and `prospectSupplied` now also
 * accept `null`, which a JSON body carries where a form carried `""`. The
 * `opportunityId` field is dropped because the id is in the path; a body that
 * still sends it is accepted and the extra key ignored, which is what the ROI
 * calculator does.
 */
const roiSchema = z.object({
  employees: z.coerce.number().min(0).max(1_000_000),
  hoursPerWeek: z.coerce.number().min(0).max(168),
  hourlyCost: z.coerce.number().min(0).max(10_000),
  projectCost: z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    }),
  prospectSupplied: z
    .union([z.boolean(), z.string()])
    .nullish()
    .transform((v) => v === true || v === "on" || v === "true"),
});

export default route(async (event, { user, params }) => {
  const input = await parseBody(event, roiSchema);

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: params.id, lead: { userId: user.id, deletedAt: null } },
    select: { id: true, leadId: true, companyId: true, title: true },
  });
  if (!opportunity) notFound("Opportunity");

  const figures = {
    employees: Math.round(input.employees),
    hoursPerWeek: input.hoursPerWeek,
    hourlyCost: input.hourlyCost,
    projectCost: input.projectCost,
    prospectSupplied: input.prospectSupplied,
  };

  await prisma.roiEstimate.upsert({
    where: { opportunityId: opportunity.id },
    create: { opportunityId: opportunity.id, ...figures },
    update: figures,
  });

  await prisma.activity.create({
    data: {
      userId: user.id,
      leadId: opportunity.leadId,
      companyId: opportunity.companyId,
      type: "ROI_ESTIMATE_SAVED",
      summary: `ROI figures saved for ${opportunity.title}`,
      detail: input.prospectSupplied
        ? "Figures supplied by the prospect."
        : "Figures are our estimate, not confirmed by the prospect.",
      actorType: "HUMAN",
    },
  });

  await audit({
    userId: user.id,
    action: "roi.saved",
    entityType: "Opportunity",
    entityId: opportunity.id,
    metadata: { prospectSupplied: input.prospectSupplied },
  });

  return ok({ saved: true });
});
