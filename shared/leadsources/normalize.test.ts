import { describe, expect, it } from "vitest";
import {
  cleanText,
  domainFromEmail,
  normalizeDomain,
  normalizeEmail,
  parseEmployeeCount,
} from "./normalize";

describe("normalizeDomain", () => {
  it("strips protocol, www, path and query", () => {
    expect(normalizeDomain("https://www.Acme.com/pricing?ref=x")).toBe("acme.com");
  });

  it("keeps subdomains that are not www", () => {
    expect(normalizeDomain("https://eu.acme.co.uk")).toBe("eu.acme.co.uk");
  });

  it("strips a port and a trailing dot", () => {
    expect(normalizeDomain("acme.com:8443")).toBe("acme.com");
    expect(normalizeDomain("acme.com.")).toBe("acme.com");
  });

  it("recovers the domain from a pasted email", () => {
    expect(normalizeDomain("jo@acme.com")).toBe("acme.com");
  });

  it("rejects values that are not domains", () => {
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("not a domain!")).toBeNull();
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain(null)).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jo@Acme.COM ")).toBe("jo@acme.com");
  });

  it("rejects malformed addresses", () => {
    expect(normalizeEmail("jo@acme")).toBeNull();
    expect(normalizeEmail("jo acme.com")).toBeNull();
    expect(normalizeEmail("@acme.com")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("domainFromEmail", () => {
  it("extracts and normalises the host", () => {
    expect(domainFromEmail("Jo@WWW.Acme.com")).toBe("acme.com");
  });

  it("returns null for a bad address", () => {
    expect(domainFromEmail("nope")).toBeNull();
  });
});

describe("parseEmployeeCount", () => {
  it("reads plain and formatted numbers", () => {
    expect(parseEmployeeCount("250")).toBe(250);
    expect(parseEmployeeCount("1,200")).toBe(1200);
    expect(parseEmployeeCount(80)).toBe(80);
  });

  it("takes the midpoint of a range", () => {
    expect(parseEmployeeCount("50-200")).toBe(125);
    expect(parseEmployeeCount("20 to 40")).toBe(30);
  });

  it("reads approximate and open-ended forms", () => {
    expect(parseEmployeeCount("~40")).toBe(40);
    expect(parseEmployeeCount("500+")).toBe(500);
  });

  it("returns null for anything unreadable", () => {
    expect(parseEmployeeCount("lots")).toBeNull();
    expect(parseEmployeeCount("")).toBeNull();
    expect(parseEmployeeCount(null)).toBeNull();
    expect(parseEmployeeCount(-5)).toBeNull();
  });
});

describe("cleanText", () => {
  it("collapses whitespace", () => {
    expect(cleanText("  Acme   Logistics \n Ltd ")).toBe("Acme Logistics Ltd");
  });

  it("returns null for an empty value", () => {
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(null)).toBeNull();
  });
});
