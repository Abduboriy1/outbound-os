import Papa from "papaparse";
import type { DiscoveredLead, LeadProvider } from "~~/server/lib/contracts";
import {
  CSV_FIELDS,
  REQUIRED_CSV_FIELDS,
  guessMapping,
  type CsvField,
} from "./fields";
import {
  cleanText,
  normalizeDomain,
  normalizeEmail,
  parseEmployeeCount,
  websiteFromDomain,
} from "./normalize";

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  /** Parser complaints, e.g. a row with the wrong number of fields. */
  errors: string[];
};

/**
 * Reads a CSV into headers plus raw rows. The first non-empty row is taken as
 * the header row; papaparse's own header mode is avoided so duplicate or blank
 * column names survive to the mapping step instead of silently colliding.
 */
export function parseCsv(text: string): ParsedCsv {
  if (!text.trim()) return { headers: [], rows: [], errors: [] };

  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy",
  });

  const rows = (result.data ?? []).filter((row) =>
    row.some((cell) => (cell ?? "").trim() !== ""),
  );
  const errors = (result.errors ?? []).map(
    (e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`,
  );

  if (rows.length === 0) return { headers: [], rows: [], errors };

  return {
    headers: rows[0].map((h) => (h ?? "").trim()),
    rows: rows.slice(1),
    errors,
  };
}

export type RowIssue = {
  /** 1-based row number as the user sees it in a spreadsheet (header is row 1). */
  row: number;
  field?: CsvField;
  message: string;
};

export type MapResult = {
  leads: DiscoveredLead[];
  issues: RowIssue[];
  /** Rows dropped because a required field was missing or unusable. */
  skipped: number;
};

export type CsvMapping = Partial<Record<CsvField, number>>;

/**
 * Turns raw rows into DiscoveredLead objects using a user-confirmed column
 * mapping. Bad values are reported rather than guessed at: an unparseable email
 * is dropped with an issue so the operator can fix the source file, and a row
 * with no company name is skipped entirely.
 */
export function mapRows(
  rows: string[][],
  mapping: CsvMapping,
  options: { headerOffset?: number } = {},
): MapResult {
  const headerOffset = options.headerOffset ?? 2; // row 1 is the header
  const leads: DiscoveredLead[] = [];
  const issues: RowIssue[] = [];
  let skipped = 0;

  rows.forEach((row, index) => {
    const rowNumber = index + headerOffset;
    const cell = (field: CsvField) => {
      const column = mapping[field];
      if (column == null) return null;
      return cleanText(row[column]);
    };

    const companyName = cell("companyName");
    if (!companyName) {
      skipped += 1;
      issues.push({
        row: rowNumber,
        field: "companyName",
        message: "Skipped: no company name",
      });
      return;
    }

    const rawEmail = cell("contactEmail");
    const contactEmail = normalizeEmail(rawEmail);
    if (rawEmail && !contactEmail) {
      issues.push({
        row: rowNumber,
        field: "contactEmail",
        message: `Ignored unreadable email "${rawEmail}"`,
      });
    }

    const domain =
      normalizeDomain(cell("domain")) ??
      normalizeDomain(cell("website")) ??
      (contactEmail ? normalizeDomain(contactEmail.split("@")[1]) : null);

    const rawEmployees = cell("employeeCount");
    const employeeCount = parseEmployeeCount(rawEmployees);
    if (rawEmployees && employeeCount == null) {
      issues.push({
        row: rowNumber,
        field: "employeeCount",
        message: `Ignored unreadable headcount "${rawEmployees}"`,
      });
    }

    leads.push({
      companyName,
      domain: domain ?? undefined,
      website: cleanText(cell("website")) ?? websiteFromDomain(domain) ?? undefined,
      industry: cell("industry") ?? undefined,
      location: cell("location") ?? undefined,
      employeeCount: employeeCount ?? undefined,
      description: cell("description") ?? undefined,
      contactFirstName: cell("contactFirstName") ?? undefined,
      contactLastName: cell("contactLastName") ?? undefined,
      contactTitle: cell("contactTitle") ?? undefined,
      contactEmail: contactEmail ?? undefined,
      sourceDetail: `CSV row ${rowNumber}`,
    });
  });

  return { leads, issues, skipped };
}

/** Fields the mapping must fill before an import can be committed. */
export function missingRequiredFields(mapping: CsvMapping): CsvField[] {
  return REQUIRED_CSV_FIELDS.filter((field) => mapping[field] == null);
}

export type CsvDiscoverInput = {
  text: string;
  mapping?: CsvMapping;
};

/**
 * Plan §8 — the CSV source behind the shared LeadProvider interface, so a
 * spreadsheet import and a future search API reach the pipeline the same way.
 */
export class CSVProvider implements LeadProvider {
  readonly name = "csv";
  readonly kind = "csv" as const;

  async discover(input: unknown): Promise<DiscoveredLead[]> {
    const { text, mapping } = input as CsvDiscoverInput;
    if (typeof text !== "string" || text.trim() === "") return [];
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) return [];
    const resolved = mapping ?? guessMapping(parsed.headers);
    return mapRows(parsed.rows, resolved).leads;
  }
}

export { CSV_FIELDS, guessMapping };
