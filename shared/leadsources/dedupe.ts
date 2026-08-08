import type { DiscoveredLead } from "~~/server/lib/contracts";
import { domainFromEmail, normalizeDomain, normalizeEmail } from "./normalize";

export type ExistingKey = {
  domain?: string | null;
  email?: string | null;
  /** Shown to the user so a duplicate can be traced back to a record. */
  label?: string;
};

export type DuplicateReason = "domain" | "email" | "duplicate-in-file";

export type DedupedLead = {
  lead: DiscoveredLead;
  /** Position in the input list, so the preview can point at a CSV row. */
  index: number;
};

export type DuplicateLead = DedupedLead & {
  reason: DuplicateReason;
  matched: string;
};

export type DedupeResult = {
  unique: DedupedLead[];
  duplicates: DuplicateLead[];
};

/** Keys a lead is matched on, most reliable first. */
export function leadKeys(lead: DiscoveredLead) {
  const domain =
    normalizeDomain(lead.domain) ??
    normalizeDomain(lead.website) ??
    domainFromEmail(lead.contactEmail);
  return { domain, email: normalizeEmail(lead.contactEmail) };
}

/**
 * Splits incoming leads into the ones worth creating and the ones already
 * known. Matching is on normalised domain first (one company, one record) and
 * then on contact email, which also catches two people at the same firm being
 * imported twice from different files.
 *
 * Duplicates inside the incoming batch itself are caught too — spreadsheets
 * routinely repeat a company across rows.
 */
export function dedupeLeads(
  incoming: DiscoveredLead[],
  existing: ExistingKey[] = [],
): DedupeResult {
  const knownDomains = new Map<string, string>();
  const knownEmails = new Map<string, string>();

  for (const record of existing) {
    const domain = normalizeDomain(record.domain);
    const email = normalizeEmail(record.email);
    if (domain && !knownDomains.has(domain))
      knownDomains.set(domain, record.label ?? domain);
    if (email && !knownEmails.has(email))
      knownEmails.set(email, record.label ?? email);
  }

  const unique: DedupedLead[] = [];
  const duplicates: DuplicateLead[] = [];
  const seenDomains = new Set<string>();
  const seenEmails = new Set<string>();

  incoming.forEach((lead, index) => {
    const { domain, email } = leadKeys(lead);

    if (email && seenEmails.has(email)) {
      duplicates.push({ lead, index, reason: "duplicate-in-file", matched: email });
      return;
    }
    if (domain && seenDomains.has(domain)) {
      duplicates.push({ lead, index, reason: "duplicate-in-file", matched: domain });
      return;
    }
    if (email && knownEmails.has(email)) {
      duplicates.push({ lead, index, reason: "email", matched: knownEmails.get(email)! });
      return;
    }
    if (domain && knownDomains.has(domain)) {
      duplicates.push({
        lead,
        index,
        reason: "domain",
        matched: knownDomains.get(domain)!,
      });
      return;
    }

    if (domain) seenDomains.add(domain);
    if (email) seenEmails.add(email);
    unique.push({ lead, index });
  });

  return { unique, duplicates };
}

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  domain: "Company already exists",
  email: "Contact already exists",
  "duplicate-in-file": "Repeated in this file",
};
