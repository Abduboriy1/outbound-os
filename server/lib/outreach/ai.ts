/**
 * Binding between the outreach agents and the orchestration layer (plan §31).
 *
 * The agents are written against the structural `AgentRunner` shape so they
 * stay testable without a provider. This module is the single place where the
 * concrete `AIService` is resolved.
 *
 * The import is deferred: `~~/server/lib/ai/service` reaches the Prisma client and the
 * provider registry, and the pure sequence and follow-up rules in this
 * directory must remain importable from a plain unit test.
 */

import type { AgentRunner } from "~~/server/lib/ai/agents/outreach";

export async function aiRunner(): Promise<AgentRunner> {
  const { aiService } = await import("~~/server/lib/ai/service");
  return aiService();
}

export type { AgentRunner };
