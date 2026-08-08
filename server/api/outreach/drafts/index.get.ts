import { ok, route } from "~~/server/lib/api";
import { pendingApprovals } from "~~/server/lib/outreach/queries";

export default route(async (_event, { user }) =>
  ok(await pendingApprovals(user.id)),
);
