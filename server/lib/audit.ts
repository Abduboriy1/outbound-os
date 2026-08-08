import { prisma } from "./db";
import type { ActorType, Prisma } from "~~/server/generated/prisma/client";

export type AuditInput = {
  userId?: string | null;
  actorType?: ActorType;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

/**
 * Plan §36 — every automated action is logged. Auditing must never take down
 * the operation it is recording, so failures are swallowed after logging.
 */
export async function audit(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        actorType: input.actorType ?? "HUMAN",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit log", error);
  }
}
