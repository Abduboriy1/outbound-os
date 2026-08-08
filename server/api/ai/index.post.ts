import { z } from "zod";
import { HttpError, ok, parseBody, route } from "~~/server/lib/api";
import { enqueue } from "~~/server/lib/queue";
import { generateWeeklyReview } from "~~/server/lib/analytics/coach";
import {
  AgentInputError,
  isLeadAgent,
  runAgentForLead,
  runSalesCoach,
  LEAD_AGENTS,
} from "~~/server/lib/ai/leadAgents";

const bodySchema = z.object({
  agent: z.string().min(1),
  leadId: z.string().optional(),
});

/**
 * Runs a named agent (plan §31). Research is queued because it fetches pages;
 * the analysis agents run inline because they are one model call over evidence
 * that already exists.
 */
export default route(async (event, { user }) => {
  const { agent, leadId } = await parseBody(event, bodySchema);

  if (agent === "research") {
    if (!leadId) throw new HttpError("leadId is required for the research agent", 400);
    const queued = await enqueue("research", { leadId, userId: user.id });
    return ok({ agent, mode: queued.mode, error: queued.error ?? null }, { status: 202 });
  }

  if (agent === "salesCoach") {
    return ok(await runSalesCoach(user.id));
  }

  /**
   * Port of `generateWeeklyReviewAction` (`src/components/dashboard/actions.ts`).
   * It runs the salesCoach model against the weekly-review schema and records
   * the AiRun row the analytics page reads back through `/api/ai/runs`.
   * `generateWeeklyReview` swallows model failures and answers null, which the
   * server action turned into a silent no-op; an endpoint says so instead.
   */
  if (agent === "weeklyReview") {
    const run = await generateWeeklyReview(user.id);
    if (!run) throw new HttpError("The weekly review could not be generated", 502);
    return ok(run);
  }

  if (!isLeadAgent(agent)) {
    throw new HttpError(
      `Unsupported agent "${agent}". Supported here: research, salesCoach, weeklyReview, ${LEAD_AGENTS.join(", ")}.`,
      400,
    );
  }
  if (!leadId) throw new HttpError(`leadId is required for the ${agent} agent`, 400);

  try {
    return ok(await runAgentForLead({ agent, leadId, userId: user.id }));
  } catch (error) {
    if (error instanceof AgentInputError) throw new HttpError(error.message, 422);
    throw error;
  }
});
