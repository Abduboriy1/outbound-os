/**
 * The option lists the CRM forms need.
 *
 * The source called `companyOptions()`, `contactOptions()` and `icpOptions()`
 * directly from server components. None of those has a dedicated endpoint, so
 * these read the list endpoints instead — same rows, same ordering.
 *
 * `companyOptions`/`contactOptions` took 500 rows where `listCompanies` and
 * `listContacts` default to 200, so both pickers ask for `limit: 500` — the
 * ceiling those two endpoints accept — and the picker is no longer truncated
 * for a workspace with more than 200 companies.
 */
import { computed } from "vue";
import type { CompanyListRow, ContactListRow, IcpRow } from "./api-types";
import type { Option } from "./types";

/** The source's `companyOptions()` row cap. */
const OPTION_LIMIT = 500;

export function useCompanyOptions() {
  return useFetch("/api/companies", {
    key: "company-options",
    query: { limit: OPTION_LIMIT },
    transform: (res: { data: CompanyListRow[] }) => res.data,
    default: () => [] as CompanyListRow[],
  });
}

export function useContactOptions() {
  return useFetch("/api/contacts", {
    key: "contact-options",
    query: { limit: OPTION_LIMIT },
    transform: (res: { data: ContactListRow[] }) => res.data,
    default: () => [] as ContactListRow[],
  });
}

export function useIcpOptions() {
  return useFetch("/api/icps", {
    key: "icp-options",
    transform: (res: { data: IcpRow[] }) => res.data,
    default: () => [] as IcpRow[],
  });
}

export function toCompanyChoices(companies: { id: string; name: string }[]): Option[] {
  return companies.map((c) => ({ value: c.id, label: c.name }));
}

export function toContactChoices(
  contacts: { id: string; firstName: string; lastName: string | null }[],
): Option[] {
  return contacts.map((c) => ({
    value: c.id,
    label: `${c.firstName} ${c.lastName ?? ""}`.trim(),
  }));
}

export function toIcpChoices(icps: { id: string; name: string }[]): Option[] {
  return icps.map((i) => ({ value: i.id, label: i.name }));
}

/** Convenience for the three forms that need all three lists at once. */
export async function useLeadFormOptions() {
  const [{ data: companies }, { data: contacts }, { data: icps }] = await Promise.all([
    useCompanyOptions(),
    useContactOptions(),
    useIcpOptions(),
  ]);

  return {
    companies,
    contacts,
    icps,
    companyChoices: computed(() => toCompanyChoices(companies.value)),
    contactChoices: computed(() => toContactChoices(contacts.value)),
    icpChoices: computed(() => toIcpChoices(icps.value)),
  };
}
