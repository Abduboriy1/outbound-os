import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { contactFiltersSchema } from "~~/server/lib/leads/filters";
import { listContacts } from "~~/server/lib/leads/queries";

/** `limit` exists for the same reason as on `/api/companies`; default 200. */
const querySchema = contactFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export default route(async (event, { user }) => {
  const { limit, ...filters } = parseQuery(event, querySchema);
  return ok(await listContacts(user.id, filters, limit));
});
