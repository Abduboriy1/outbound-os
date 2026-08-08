import { describe, expect, it } from "vitest";
import type { DiscoveredLead } from "~~/server/lib/contracts";
import { dedupeLeads, leadKeys } from "./dedupe";

function lead(over: Partial<DiscoveredLead> & { companyName: string }): DiscoveredLead {
  return { ...over };
}

describe("leadKeys", () => {
  it("prefers an explicit domain", () => {
    expect(
      leadKeys(lead({ companyName: "A", domain: "acme.com", website: "https://other.com" }))
        .domain,
    ).toBe("acme.com");
  });

  it("falls back to the website, then the email host", () => {
    expect(leadKeys(lead({ companyName: "A", website: "https://acme.com" })).domain).toBe(
      "acme.com",
    );
    expect(leadKeys(lead({ companyName: "A", contactEmail: "jo@acme.com" })).domain).toBe(
      "acme.com",
    );
  });
});

describe("dedupeLeads", () => {
  it("keeps everything when nothing matches", () => {
    const result = dedupeLeads([
      lead({ companyName: "Acme", domain: "acme.com" }),
      lead({ companyName: "Bolt", domain: "bolt.io" }),
    ]);
    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("drops a lead whose company already exists", () => {
    const result = dedupeLeads(
      [lead({ companyName: "Acme Ltd", website: "https://www.acme.com" })],
      [{ domain: "acme.com", label: "Acme Logistics" }],
    );
    expect(result.unique).toHaveLength(0);
    expect(result.duplicates[0]).toMatchObject({
      reason: "domain",
      matched: "Acme Logistics",
    });
  });

  it("drops a lead whose contact email already exists", () => {
    const result = dedupeLeads(
      [lead({ companyName: "Acme", contactEmail: "JO@acme.com" })],
      [{ email: "jo@acme.com", label: "Jo Rivera" }],
    );
    expect(result.duplicates[0]).toMatchObject({ reason: "email", matched: "Jo Rivera" });
  });

  it("prefers the email match when both keys hit", () => {
    const result = dedupeLeads(
      [lead({ companyName: "Acme", domain: "acme.com", contactEmail: "jo@acme.com" })],
      [{ domain: "acme.com" }, { email: "jo@acme.com" }],
    );
    expect(result.duplicates[0].reason).toBe("email");
  });

  it("catches a company repeated inside the same file", () => {
    const result = dedupeLeads([
      lead({ companyName: "Acme", domain: "acme.com" }),
      lead({ companyName: "Acme Logistics", website: "http://acme.com/careers" }),
    ]);
    expect(result.unique).toHaveLength(1);
    expect(result.duplicates[0]).toMatchObject({
      reason: "duplicate-in-file",
      matched: "acme.com",
      index: 1,
    });
  });

  it("catches a contact repeated inside the same file", () => {
    const result = dedupeLeads([
      lead({ companyName: "Acme", contactEmail: "jo@acme.com" }),
      lead({ companyName: "Acme", contactEmail: "Jo@Acme.com" }),
    ]);
    expect(result.duplicates[0].reason).toBe("duplicate-in-file");
  });

  it("keeps leads that have no usable key rather than collapsing them", () => {
    const result = dedupeLeads([
      lead({ companyName: "Acme" }),
      lead({ companyName: "Bolt" }),
    ]);
    expect(result.unique).toHaveLength(2);
  });

  it("reports the original position of every lead", () => {
    const result = dedupeLeads(
      [
        lead({ companyName: "Known", domain: "known.com" }),
        lead({ companyName: "New", domain: "new.com" }),
      ],
      [{ domain: "known.com" }],
    );
    expect(result.unique[0].index).toBe(1);
    expect(result.duplicates[0].index).toBe(0);
  });

  it("ignores unusable existing keys", () => {
    const result = dedupeLeads(
      [lead({ companyName: "Acme", domain: "acme.com" })],
      [{ domain: null, email: null }, { domain: "not a domain" }],
    );
    expect(result.unique).toHaveLength(1);
  });
});
