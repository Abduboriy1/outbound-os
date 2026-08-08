import crypto from "node:crypto";
import { z } from "zod";
import { normalizeDomain, normalizeEmail, parseEmployeeCount } from "~~/shared/leadsources/normalize";

/**
 * Pure validation, authentication and rate-limiting logic for the public
 * website intake endpoint (plan §56, §57). Kept out of the route handler so
 * every rule here is unit-testable without a request, a session or a database.
 *
 * Everything the website submits is untrusted text written by a stranger. It is
 * length-capped and stored as data; it is never interpreted as an instruction
 * and never concatenated into an AI system prompt (plan §36).
 */

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

const attribution = optionalText(500);

export const intakeSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120),
    company: z.string().trim().min(1, "company is required").max(200),
    email: z.string().trim().toLowerCase().max(320).email("email must be valid"),
    companyWebsite: optionalText(500),
    problemDescription: z
      .string()
      .trim()
      .min(10, "problemDescription is too short")
      .max(5000),
    frequency: optionalText(200),
    /** Free text or a number: websites collect "3", "3-5" and "a whole team". */
    peopleInvolved: z.union([z.number(), z.string().trim().max(120)]).optional().nullable(),
    /** A list, or a comma-separated string from a plain text input. */
    toolsInvolved: z
      .union([z.string().trim().max(1000), z.array(z.string().trim().max(200)).max(50)])
      .optional()
      .nullable(),
    // Attribution is accepted in both spellings. The plan writes these keys in
    // snake_case, but the website submits the camelCase names it uses
    // internally; rejecting either would silently drop every real submission.
    utm_source: attribution,
    utm_medium: attribution,
    utm_campaign: attribution,
    landing_page: attribution,
    utmSource: attribution,
    utmMedium: attribution,
    utmCampaign: attribution,
    landingPage: attribution,
    referrer: attribution,
  })
  .strict();

export type IntakeInput = z.infer<typeof intakeSchema>;

export type NormalizedIntake = {
  name: string;
  company: string;
  email: string;
  companyWebsite: string | null;
  domain: string | null;
  problemDescription: string;
  frequency: string | null;
  peopleInvolved: string | null;
  peopleCount: number | null;
  toolsInvolved: string[];
  attribution: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrer: string | null;
    landingPage: string | null;
  };
};

/** First non-empty value among the accepted spellings of one field. */
function firstText(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function normalizeIntake(input: IntakeInput): NormalizedIntake {
  const email = normalizeEmail(input.email) ?? input.email.toLowerCase();
  const domain =
    normalizeDomain(input.companyWebsite) ?? normalizeDomain(email.split("@")[1]);

  const tools = Array.isArray(input.toolsInvolved)
    ? input.toolsInvolved
    : (input.toolsInvolved ?? "").split(",");

  const people =
    input.peopleInvolved == null ? null : String(input.peopleInvolved).trim() || null;

  return {
    name: input.name.trim(),
    company: input.company.trim(),
    email,
    companyWebsite: input.companyWebsite?.trim() || null,
    domain,
    problemDescription: input.problemDescription.trim(),
    frequency: input.frequency?.trim() || null,
    peopleInvolved: people,
    peopleCount: parseEmployeeCount(people),
    toolsInvolved: tools.map((t) => t.trim()).filter(Boolean).slice(0, 50),
    attribution: {
      utmSource: firstText(input.utm_source, input.utmSource),
      utmMedium: firstText(input.utm_medium, input.utmMedium),
      utmCampaign: firstText(input.utm_campaign, input.utmCampaign),
      referrer: firstText(input.referrer),
      landingPage: firstText(input.landing_page, input.landingPage),
    },
  };
}

export type ValidationResult =
  | { ok: true; value: NormalizedIntake }
  | { ok: false; issues: { field: string; message: string }[] };

/** Validates a raw body and reports field-level problems without echoing input. */
export function validateIntake(body: unknown): ValidationResult {
  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    };
  }
  return { ok: true, value: normalizeIntake(parsed.data) };
}

/* ----------------------------------------------------------------- auth */

/**
 * Bearer-token check. Both sides are hashed to a fixed 32 bytes before the
 * comparison so timingSafeEqual never throws on a length mismatch and the
 * token's length is not observable from response timing.
 */
export function authorizeIntake(
  authorizationHeader: string | null | undefined,
  expectedToken: string,
): boolean {
  if (!expectedToken) return false;
  if (!authorizationHeader) return false;

  const match = /^Bearer[ ]+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return false;

  return constantTimeEquals(match[1], expectedToken);
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = crypto.createHash("sha256").update(a, "utf8").digest();
  const right = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(left, right);
}

/* ----------------------------------------------------------- rate limit */

export type RateLimitStore = Map<string, number[]>;

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export const INTAKE_RATE_LIMIT: RateLimitOptions = {
  limit: 10,
  windowMs: 60 * 60 * 1000,
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Sliding-window limiter over an in-memory store. Deliberately simple: this is
 * a single-tenant deployment and the goal is to blunt a form-spam script, not
 * to survive a distributed flood. Swapping the store for Redis is a one-line
 * change at the call site.
 */
export function checkRateLimit(
  store: RateLimitStore,
  key: string,
  now: number,
  options: RateLimitOptions = INTAKE_RATE_LIMIT,
): RateLimitResult {
  const cutoff = now - options.windowMs;
  const hits = (store.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= options.limit) {
    store.set(key, hits);
    const oldest = hits[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  store.set(key, hits);
  return {
    allowed: true,
    remaining: options.limit - hits.length,
    retryAfterSeconds: 0,
  };
}

/* --------------------------------------------------------------- dedupe */

export type IntakeExisting = {
  companyId: string | null;
  contactId: string | null;
  /** A lead for this company that is still live, if any. */
  openLeadId: string | null;
};

export type IntakePlan = {
  createCompany: boolean;
  createContact: boolean;
  createLead: boolean;
  /** True when this submission lands on an existing live lead. */
  duplicate: boolean;
};

/**
 * Decides what a submission should create. A company that fills the form twice
 * must not produce two companies, two contacts or two competing leads — the
 * second submission is recorded against the lead that already exists (plan §56).
 */
export function planIntake(existing: IntakeExisting): IntakePlan {
  return {
    createCompany: !existing.companyId,
    createContact: !existing.contactId,
    createLead: !existing.openLeadId,
    duplicate: Boolean(existing.openLeadId),
  };
}

/** First forwarded address, or a stable fallback so the limiter still buckets. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
