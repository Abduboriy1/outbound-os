/**
 * Identity normalisation for imported leads. Dedupe is only as good as the keys
 * it compares, so every domain and email passes through here before it is used
 * as a key or written to the database (plan §8).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Reduces anything domain-ish — a bare domain, a full URL, a host with a port —
 * to a lowercase registrable host. `www.` is dropped because "Acme" reached at
 * acme.com and www.acme.com is one company, not two.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/^[^/@]*@/, ""); // strip userinfo or a pasted email local part
  value = value.split(/[/?#]/)[0];
  value = value.split(":")[0];
  value = value.replace(/^www\./, "");
  value = value.replace(/\.$/, "");

  if (!value.includes(".")) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  return value;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(value)) return null;
  return value;
}

export function domainFromEmail(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return normalizeDomain(normalized.split("@")[1]);
}

/** Collapses whitespace and trims; returns null for an effectively empty value. */
export function cleanText(input: string | null | undefined): string | null {
  if (input == null) return null;
  const value = String(input).replace(/\s+/g, " ").trim();
  return value === "" ? null : value;
}

/**
 * Parses a headcount written the way humans write it: "250", "1,200", "50-200"
 * (midpoint), "~40", "40+". Returns null when nothing sensible can be read.
 */
export function parseEmployeeCount(input: string | number | null | undefined) {
  if (input == null) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) && input > 0 ? Math.round(input) : null;
  }
  const value = input.replace(/[,\s~]/g, "");
  if (!value) return null;

  const range = value.match(/^(\d+)[-–to]+(\d+)\+?$/i);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);

  const single = value.match(/^(\d+)\+?$/);
  if (single) {
    const n = Number(single[1]);
    return n > 0 ? n : null;
  }
  return null;
}

/** Best-effort URL for a company, derived from whatever the row supplied. */
export function websiteFromDomain(domain: string | null): string | null {
  return domain ? `https://${domain}` : null;
}
