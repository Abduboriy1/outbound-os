import { ok, parseQuery, route } from "~~/server/lib/api";
import { leadFiltersSchema } from "~~/server/lib/leads/filters";
import { countLeads, listLeads } from "~~/server/lib/leads/queries";

export default route(async (event, { user }) => {
  const filters = parseQuery(event, leadFiltersSchema);
  const now = new Date();
  const [leads, total] = await Promise.all([
    listLeads(user.id, filters, now),
    countLeads(user.id, filters, now),
  ]);
  return ok({ leads, total });
});
