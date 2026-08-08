import { z } from "zod";
import type { DiscoveredLead, LeadProvider } from "~~/server/lib/contracts";
import {
  cleanText,
  normalizeDomain,
  normalizeEmail,
  websiteFromDomain,
} from "./normalize";

/**
 * A hand-typed lead. Validation is deliberately forgiving about everything
 * except the company name — an operator entering a lead they just found should
 * not be blocked because they do not know the headcount yet.
 */
export const manualLeadSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  domain: z.string().trim().max(255).optional().or(z.literal("")),
  website: z.string().trim().max(500).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  location: z.string().trim().max(200).optional().or(z.literal("")),
  employeeCount: z.coerce.number().int().positive().max(10_000_000).optional(),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  contactFirstName: z.string().trim().max(100).optional().or(z.literal("")),
  contactLastName: z.string().trim().max(100).optional().or(z.literal("")),
  contactTitle: z.string().trim().max(150).optional().or(z.literal("")),
  contactEmail: z.string().trim().max(320).optional().or(z.literal("")),
  sourceDetail: z.string().trim().max(200).optional().or(z.literal("")),
});

export type ManualLeadInput = z.input<typeof manualLeadSchema>;

export function toDiscoveredLead(
  input: z.output<typeof manualLeadSchema>,
): DiscoveredLead {
  const contactEmail = normalizeEmail(input.contactEmail);
  const domain =
    normalizeDomain(input.domain) ??
    normalizeDomain(input.website) ??
    (contactEmail ? normalizeDomain(contactEmail.split("@")[1]) : null);

  return {
    companyName: input.companyName.trim(),
    domain: domain ?? undefined,
    website: cleanText(input.website) ?? websiteFromDomain(domain) ?? undefined,
    industry: cleanText(input.industry) ?? undefined,
    location: cleanText(input.location) ?? undefined,
    employeeCount: input.employeeCount ?? undefined,
    description: cleanText(input.description) ?? undefined,
    contactFirstName: cleanText(input.contactFirstName) ?? undefined,
    contactLastName: cleanText(input.contactLastName) ?? undefined,
    contactTitle: cleanText(input.contactTitle) ?? undefined,
    contactEmail: contactEmail ?? undefined,
    sourceDetail: cleanText(input.sourceDetail) ?? "Manual entry",
  };
}

/** Plan §8 — manual entry is a lead source like any other. */
export class ManualProvider implements LeadProvider {
  readonly name = "manual";
  readonly kind = "manual" as const;

  async discover(input: unknown): Promise<DiscoveredLead[]> {
    const rows = Array.isArray(input) ? input : [input];
    return rows.map((row) => toDiscoveredLead(manualLeadSchema.parse(row)));
  }
}
