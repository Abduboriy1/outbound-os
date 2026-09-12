import { z } from "zod";
import { HttpError, ok, parseBody, route } from "~~/server/lib/api";
import { audit } from "~~/server/lib/audit";
import { AiRunError, GroundedSearchUnsupportedError } from "~~/server/lib/ai/service";
import { discoverLeads, MAX_DISCOVERY_COUNT } from "~~/server/lib/leads/prospect";

/**
 * AI lead discovery (plan §8). A dry run: it writes `AiRun` rows and nothing
 * else, so the operator sees exactly what would be created before anything is.
 * Committing goes through `POST /api/import`, the same path the CSV importer
 * uses, which is what gives discovered leads the same transaction, stage
 * history, and audit trail as every other lead.
 *
 * POST rather than GET because it spends money and takes tens of seconds; it is
 * not something a prefetch or a refresh should trigger.
 */

const bodySchema = z.object({
  icpId: z.string().trim().min(1).optional(),
  count: z.number().int().min(1).max(MAX_DISCOVERY_COUNT).default(10),
  criteria: z.string().trim().max(1000).optional(),
});

export default route(async (event, { user }) => {
  const body = await parseBody(event, bodySchema);

  try {
    const result = await discoverLeads({
      userId: user.id,
      icpId: body.icpId ?? null,
      count: body.count,
      criteria: body.criteria ?? null,
    });

    await audit({
      userId: user.id,
      actorType: "AI",
      action: "leads.discovered",
      entityType: "Lead",
      entityId: result.searchRunId,
      metadata: {
        found: result.candidates.length,
        rejected: result.rejected.length,
        duplicates: result.duplicates.length,
        provider: result.provider,
        model: result.model,
      },
    });

    return ok(result);
  } catch (error) {
    // Both of these are the operator's problem to fix, not a server fault, so
    // they come back as a readable message rather than a 500.
    if (error instanceof GroundedSearchUnsupportedError) {
      throw new HttpError(error.message, 400);
    }
    if (error instanceof AiRunError) {
      throw new HttpError(error.message, 502);
    }
    throw error;
  }
});
