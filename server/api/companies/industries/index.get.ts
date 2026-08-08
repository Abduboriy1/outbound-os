import { ok, route } from "~~/server/lib/api";
import { companyIndustries } from "~~/server/lib/leads/queries";

/**
 * The distinct industries already in use, for the company list filter.
 * `src/app/(app)/companies/page.tsx` called `companyIndustries()` directly;
 * without this the page had to derive the options from a second, unfiltered
 * `/api/companies` request, which only ever saw the first page of companies.
 */
export default route(async (_event, { user }) => ok(await companyIndustries(user.id)));
