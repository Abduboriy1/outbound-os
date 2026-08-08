import { ok, route } from "~~/server/lib/api";
import { listLeadStageHistory } from "~~/server/lib/leads/queries";

export default route(async (_event, { params }) =>
  ok(await listLeadStageHistory(params.id)),
);
