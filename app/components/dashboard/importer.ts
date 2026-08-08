/**
 * Port of `src/app/(app)/import/actions.ts`.
 *
 * Server actions have no Nuxt equivalent (MIGRATION.md §2.3), so the file splits
 * the way the source's two halves already did:
 *
 * | server action            | here                                              |
 * | ------------------------ | ------------------------------------------------- |
 * | `existingKeys`           | `GET /api/companies`, `GET /api/contacts`         |
 * | `previewImportAction`    | the above + `dedupeLeads` in the browser          |
 * | `commitImportAction`     | `POST /api/import`                                |
 * | `createManualLeadAction` | `POST /api/import` with `sourceType: "MANUAL"`    |
 *
 * The preview stays client-side because it is a dry run that writes nothing —
 * the same thing `previewImportAction` was — and because parsing and mapping
 * already happen in the browser so a file never has to be uploaded to find out
 * whether it is usable (plan §8). The commit went behind `POST /api/import`,
 * which restores the three things the `companies → contacts → leads` chain had
 * lost: the `prisma.$transaction`, the `Imported via CSV` stage-history reason
 * with the `LEAD_IMPORTED` activity type, and the `leads.imported` audit row.
 * The endpoint re-runs `dedupeLeads` against live rows, exactly as
 * `commitImportAction` did, so the counts it returns are authoritative.
 */
import {
  dedupeLeads,
  type DiscoveredLead,
  type DuplicateReason,
  type ExistingKey,
} from "~~/shared/leadsources";

export type ImportPreview = {
  unique: { index: number; lead: DiscoveredLead }[];
  duplicates: {
    index: number;
    lead: DiscoveredLead;
    reason: DuplicateReason;
    matched: string;
  }[];
};

export type ImportResult = {
  created: number;
  skipped: number;
  error?: string;
};

/** What `POST /api/import` answers with. */
type ImportResponse = {
  data: {
    created: number;
    skipped: number;
    leadIds: string[];
    duplicates: ImportPreview["duplicates"];
  };
};

type CompanyRow = { id: string; name: string; domain: string | null };
type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
};

/** Existing companies and contacts, as dedupe keys. */
export async function existingKeys(): Promise<ExistingKey[]> {
  const [companies, contacts] = await Promise.all([
    $fetch<{ data: CompanyRow[] }>("/api/companies", { query: { limit: 500 } }),
    $fetch<{ data: ContactRow[] }>("/api/contacts", { query: { limit: 500 } }),
  ]);

  return [
    ...companies.data.map((c) => ({ domain: c.domain, label: c.name })),
    ...contacts.data.map((c) => ({
      email: c.email,
      label: [c.firstName, c.lastName].filter(Boolean).join(" "),
    })),
  ];
}

/**
 * Dry run. Nothing is written — the user sees exactly what would be created and
 * what would be skipped before committing (plan §8).
 */
export async function previewImport(leads: DiscoveredLead[]): Promise<ImportPreview> {
  const result = dedupeLeads(leads, await existingKeys());
  return {
    unique: result.unique.map(({ index, lead }) => ({ index, lead })),
    duplicates: result.duplicates.map(({ index, lead, reason, matched }) => ({
      index,
      lead,
      reason,
      matched,
    })),
  };
}

export async function commitImport(
  leads: DiscoveredLead[],
  sourceType = "CSV",
): Promise<ImportResult> {
  if (leads.length === 0) return { created: 0, skipped: 0, error: "Nothing valid to import" };

  const result = await $fetch<ImportResponse>("/api/import", {
    method: "POST",
    body: { leads, sourceType },
  });
  return { created: result.data.created, skipped: result.data.skipped };
}

/**
 * Creates Company -> Contact -> Lead for one discovered lead — the manual
 * form's commit. One `POST /api/import`, so the whole thing is one transaction
 * on the server and a failure part-way through leaves nothing behind.
 */
export async function createFromDiscovered(lead: DiscoveredLead, sourceType: string) {
  const result = await $fetch<ImportResponse>("/api/import", {
    method: "POST",
    body: { leads: [lead], sourceType },
  });
  return { created: result.data.created, leadId: result.data.leadIds[0] ?? null };
}
