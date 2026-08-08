import type { DiscoveredLead } from "~~/server/lib/contracts";

/** Importable columns, in the order the mapping UI presents them. */
export const CSV_FIELDS = [
  "companyName",
  "domain",
  "website",
  "industry",
  "location",
  "employeeCount",
  "description",
  "contactFirstName",
  "contactLastName",
  "contactTitle",
  "contactEmail",
] as const;

export type CsvField = (typeof CSV_FIELDS)[number];

export const CSV_FIELD_LABELS: Record<CsvField, string> = {
  companyName: "Company name",
  domain: "Domain",
  website: "Website",
  industry: "Industry",
  location: "Location",
  employeeCount: "Employees",
  description: "Description",
  contactFirstName: "Contact first name",
  contactLastName: "Contact last name",
  contactTitle: "Contact title",
  contactEmail: "Contact email",
};

/** Only the company needs a name; everything else can be enriched later. */
export const REQUIRED_CSV_FIELDS: CsvField[] = ["companyName"];

/**
 * Header synonyms used to pre-fill the column mapping. Matching is done on a
 * squashed lowercase form so "Company Name", "company_name" and "COMPANYNAME"
 * all resolve to the same field.
 */
const SYNONYMS: Record<CsvField, string[]> = {
  companyName: ["companyname", "company", "accountname", "account", "organisation", "organization", "business", "name"],
  domain: ["domain", "companydomain", "rootdomain", "emaildomain"],
  website: ["website", "url", "companywebsite", "site", "weburl", "homepage"],
  industry: ["industry", "sector", "vertical", "category"],
  location: ["location", "city", "country", "region", "state", "address", "hq"],
  employeeCount: ["employees", "employeecount", "headcount", "size", "companysize", "numemployees", "staff"],
  description: ["description", "about", "notes", "summary", "overview"],
  contactFirstName: ["firstname", "first", "givenname", "contactfirstname"],
  contactLastName: ["lastname", "last", "surname", "familyname", "contactlastname"],
  contactTitle: ["title", "jobtitle", "role", "position", "contacttitle"],
  contactEmail: ["email", "emailaddress", "contactemail", "workemail", "e-mail"],
};

export function squashHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Proposes a column index for each field. Nothing is auto-imported off the back
 * of this — the user always sees and can correct the mapping first (plan §8).
 */
export function guessMapping(headers: string[]): Partial<Record<CsvField, number>> {
  const squashed = headers.map(squashHeader);
  const mapping: Partial<Record<CsvField, number>> = {};
  const taken = new Set<number>();

  // Two passes, each walking synonyms in preference order. Exact matches are
  // resolved first so a bare "Name" column never steals the field that a
  // "Company Name" column alongside it should own.
  for (const exact of [true, false]) {
    for (const field of CSV_FIELDS) {
      if (mapping[field] != null) continue;
      for (const synonym of SYNONYMS[field]) {
        const index = squashed.findIndex(
          (header, i) =>
            !taken.has(i) &&
            header !== "" &&
            (exact ? header === synonym : header.includes(synonym)),
        );
        if (index >= 0) {
          mapping[field] = index;
          taken.add(index);
          break;
        }
      }
    }
  }

  return mapping;
}

export type MappedLead = DiscoveredLead;
