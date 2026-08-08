import { ok, route } from "~~/server/lib/api";
import { sequencesOverview } from "~~/server/lib/outreach/queries";

/**
 * Plan §23 — sequences with their steps and enrolments.
 * `src/app/(app)/outreach/sequences/page.tsx` called `sequencesOverview`
 * directly; this exposes the same read model unchanged.
 */
export default route(async (_event, { user }) =>
  ok(await sequencesOverview(user.id)),
);
