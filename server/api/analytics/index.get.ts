import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { loadAnalyticsReport } from "~~/server/lib/analytics/queries";
import { periodRange } from "~~/shared/goals/periods";

const querySchema = z.object({
  /** Cohort window by lead creation date. Omit for all time. */
  period: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ALL"]).default("ALL"),
});

/** Plan §30 — the full analytics report as JSON. */
export default route(async (event, { user }) => {
  const { period } = parseQuery(event, querySchema);
  const window = period === "ALL" ? undefined : periodRange(period, new Date());
  const report = await loadAnalyticsReport(user.id, window);
  return ok({ period, window: window ?? null, ...report });
});
