import { ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { prisma } from "~~/server/lib/db";
import { icpSchema, normaliseWeights } from "~~/server/lib/icps/schema";

export default route(async (event, { user }) => {
  const body = await parseBody(event, icpSchema);

  const icp = await prisma.$transaction(async (tx) => {
    // Exactly one default; promoting a new one demotes the incumbent.
    if (body.isDefault) {
      await tx.icp.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.icp.create({
      data: {
        userId: user.id,
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
    action: "icp.created",
    entityType: "Icp",
    entityId: icp.id,
    metadata: { name: icp.name },
  });

  return ok(icp, { status: 201 });
});
