import { notFound, ok, route } from "~~/server/lib/api";
import { getLead, getLeadOverview } from "~~/server/lib/leads/queries";

export default route(async (_event, { user, params }) => {
  const lead = await getLead(user.id, params.id);
  if (!lead) notFound("Lead");
  const overview = await getLeadOverview(user.id, lead.id);
  return ok({ lead, ...overview });
});
