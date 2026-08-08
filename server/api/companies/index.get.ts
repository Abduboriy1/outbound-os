import { z } from "zod";
import { ok, parseQuery, route } from "~~/server/lib/api";
import { companyFiltersSchema } from "~~/server/lib/leads/filters";
import { listCompanies } from "~~/server/lib/leads/queries";

/**
 * `limit` is not part of the source's `companyFiltersSchema`; it exists because
 * this endpoint also serves the form pickers, which the source fed from
 * `companyOptions` (500 rows) rather than from the list query (200). The
 * default is 200, so the list page is unaffected.
 */
const querySchema = companyFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export default route(async (event, { user }) => {
  const { limit, ...filters } = parseQuery(event, querySchema);
  return ok(await listCompanies(user.id, filters, limit));
});
