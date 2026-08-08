import { notFound, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { icpSchema, normaliseWeights } from "~~/server/lib/icps/schema";

export default route(async (event, { user, params }) => {
  const existing = await prisma.icp.findFirst({
    where: { id: params.id, userId: user.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) notFound("ICP");

  const body = await parseBody(event, icpSchema);

  const icp = await prisma.$transaction(async (tx) => {
    if (body.isDefault) {
      await tx.icp.updateMany({
        where: { userId: user.id, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }
    // Rules are replaced wholesale: they are a small list edited as a unit, and
    // diffing them would only add a way for the two lists to drift apart.
    await tx.icpRule.deleteMany({ where: { icpId: existing.id } });
    return tx.icp.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        description: body.description ?? null,
        industries: body.industries,
        geographies: body.geographies,
        problems: body.problems,
        targetRoles: body.targetRoles,
        minEmployees: body.minEmployees,
        maxEmployees: body.maxEmployees,
        minDealSize: body.minDealSize,
        maxDealSize: body.maxDealSize,
        isDefault: body.isDefault,
        weights: normaliseWeights(body.weights),
        rules: body.rules?.length ? { create: body.rules } : undefined,
      },
      include: { rules: true },
    });
  });

  await audit({
    userId: user.id,
    action: "icp.updated",
    entityType: "Icp",
    entityId: icp.id,
    metadata: { name: icp.name },
  });

  return ok(icp);
});
