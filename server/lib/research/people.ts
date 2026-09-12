/**
 * People discovery (research → contacts).
 *
 * Two inputs feed this:
 *   1. `decision_makers` from the research agent — named people with titles,
 *      roles, and an email only when a source actually printed one.
 *   2. A deterministic email harvest over the retrieved page text, which
 *      catches addresses the agent had no person for (info@, mailto links,
 *      plain-text addresses on /contact pages).
 *
 * Everything found is merged into the company's Contact rows, because the
 * People tab is the single place a person and their email live. Missing data
 * is fine: an email with no name becomes a contact named from the address's
 * local part, and a name with no email is stored without one.
 */

import { prisma } from "~~/server/lib/db";
import type { DecisionRole } from "~~/server/generated/prisma/client";

export type DiscoveredPerson = {
  name: string | null;
  title: string | null;
  role: DecisionRole;
  email: string | null;
  sourceUrl: string | null;
};

export type PeopleSyncResult = {
  /** Contacts created this run, as shown in the progress log. */
  created: { id: string; name: string; email: string | null }[];
  /** Existing contacts that gained an email they were missing. */
  enriched: { id: string; name: string; email: string }[];
  /** People that matched an existing contact and needed nothing. */
  matched: number;
};

/**
 * Addresses that identify a mailbox, not a person, still become contacts —
 * they are often the only way into a small company — but they must never be
 * mistaken for a person's name.
 */
const GENERIC_LOCALS = new Set([
  "info", "contact", "hello", "hi", "office", "admin", "sales", "support",
  "enquiries", "inquiries", "mail", "team", "help", "careers", "jobs",
  "accounts", "billing", "hr", "press", "marketing", "no-reply", "noreply",
]);

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Files and tracking junk that match the email regex on real pages. */
const NOT_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js|pdf)$/i;

export type HarvestedPhone = {
  number: string;
  kind: "phone" | "fax";
  sourceUrl: string | null;
};

/**
 * Loose enough for "+1 (202) 872-0885", "0113 496 0123", "202.872.0885 x12";
 * the digit-count check below is what keeps prices and years out.
 */
const PHONE_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{2,4}(?:[\s.-]\d{2,5}){0,2}/g;

/**
 * Phone and fax numbers from retrieved page text. A match only counts when
 * telephone-ish context sits just before it ("Tel:", "Call", "Fax", a phone
 * emoji-label…), because bare digit runs on the open web are usually not
 * phone numbers. "fax" context wins over "phone" for classification.
 */
export function harvestPhones(
  sources: { url: string | null; text: string }[],
): HarvestedPhone[] {
  const seen = new Map<string, HarvestedPhone>();

  for (const source of sources) {
    for (const match of source.text.matchAll(PHONE_PATTERN)) {
      const digits = match[0].replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) continue;

      const before = source.text.slice(Math.max(0, match.index - 40), match.index);
      const isFax = /\bfax\b|^f[.:]/i.test(before.slice(-24));
      const isPhone = /\b(tel|phone|call|mobile|office|direct|contact)\b|[pt][.:]\s*$/i.test(before);
      if (!isFax && !isPhone) continue;

      if (!seen.has(digits)) {
        seen.set(digits, {
          number: match[0].replace(/\s+/g, " ").trim(),
          kind: isFax ? "fax" : "phone",
          sourceUrl: source.url,
        });
      }
    }
  }

  return [...seen.values()];
}

/** Pulls every plausible email address out of retrieved page text. */
export function harvestEmails(
  sources: { url: string | null; text: string }[],
): { email: string; sourceUrl: string | null }[] {
  const seen = new Map<string, string | null>();
  for (const source of sources) {
    for (const raw of source.text.match(EMAIL_PATTERN) ?? []) {
      const email = raw.toLowerCase();
      if (NOT_EMAIL.test(email)) continue;
      if (!seen.has(email)) seen.set(email, source.url);
    }
  }
  return [...seen.entries()].map(([email, sourceUrl]) => ({ email, sourceUrl }));
}

/**
 * "jane.smith" → { firstName: "Jane", lastName: "Smith" }; "info" stays as-is
 * so a mailbox contact is recognisable as one. The user's rule: when only an
 * email was found, the part before the @ is the name.
 */
export function nameFromEmail(email: string): { firstName: string; lastName: string | null } {
  const local = email.split("@")[0] ?? email;
  if (GENERIC_LOCALS.has(local)) return { firstName: local, lastName: null };
  const parts = local
    .split(/[._-]+/)
    .filter((part) => part.length > 0 && !/^\d+$/.test(part))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
  if (parts.length === 0) return { firstName: local, lastName: null };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") || null };
}

function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? name, lastName: parts.slice(1).join(" ") || null };
}

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * Merges discovered people into the company's contacts.
 *
 * Match order: email (exact, case-insensitive), then full name. A name match
 * that brings a new email enriches the existing row rather than duplicating
 * it. Creation is conservative — soft-deleted contacts are matched too, so a
 * person the user deliberately removed is not resurrected.
 */
export async function syncDiscoveredPeople(options: {
  userId: string;
  companyId: string;
  people: DiscoveredPerson[];
}): Promise<PeopleSyncResult> {
  const result: PeopleSyncResult = { created: [], enriched: [], matched: 0 };
  if (options.people.length === 0) return result;

  const existing = await prisma.contact.findMany({
    where: { userId: options.userId, companyId: options.companyId },
    select: { id: true, firstName: true, lastName: true, email: true, deletedAt: true },
  });
  const byEmail = new Map(
    existing.filter((c) => c.email).map((c) => [normalise(c.email!), c]),
  );
  const byName = new Map(
    existing.map((c) => [normalise(`${c.firstName} ${c.lastName ?? ""}`), c]),
  );

  for (const person of options.people) {
    const email = person.email ? normalise(person.email) : null;
    const named = person.name
      ? splitName(person.name)
      : email
        ? nameFromEmail(email)
        : null;
    if (!named) continue; // nothing at all to store

    const fullName = normalise(`${named.firstName} ${named.lastName ?? ""}`);
    const emailMatch = email ? byEmail.get(email) : undefined;
    const nameMatch = byName.get(fullName);
    const match = emailMatch ?? nameMatch;

    if (match) {
      // A name match with a fresh email is worth writing back; anything else
      // already exists and is the user's row to manage, not the agent's.
      if (email && !match.email && !match.deletedAt) {
        await prisma.contact.update({
          where: { id: match.id },
          data: { email },
        });
        byEmail.set(email, { ...match, email });
        result.enriched.push({
          id: match.id,
          name: `${match.firstName} ${match.lastName ?? ""}`.trim(),
          email,
        });
      } else {
        result.matched += 1;
      }
      continue;
    }

    const created = await prisma.contact.create({
      data: {
        userId: options.userId,
        companyId: options.companyId,
        firstName: named.firstName,
        lastName: named.lastName,
        title: person.title,
        email,
        decisionRole: person.role,
        notes: [
          "Discovered by research.",
          person.sourceUrl ? `Source: ${person.sourceUrl}` : null,
        ]
          .filter(Boolean)
          .join(" "),
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const displayName = `${created.firstName} ${created.lastName ?? ""}`.trim();
    result.created.push({ id: created.id, name: displayName, email: created.email });
    if (email) byEmail.set(email, { ...created, deletedAt: null });
    byName.set(fullName, { ...created, deletedAt: null });
  }

  return result;
}

/**
 * Joins the agent's people with harvested emails. An address whose local part
 * resembles a listed person's name attaches to that person instead of becoming
 * a second contact; the rest become their own (possibly nameless) entries.
 */
export function mergeDiscoveredPeople(
  decisionMakers: {
    name: string;
    title: string | null;
    role: DecisionRole;
    email: string | null;
    source_url: string | null;
  }[],
  harvested: { email: string; sourceUrl: string | null }[],
): DiscoveredPerson[] {
  const people: DiscoveredPerson[] = decisionMakers.map((person) => ({
    name: person.name,
    title: person.title,
    role: person.role,
    email: person.email ? person.email.toLowerCase() : null,
    sourceUrl: person.source_url,
  }));

  const claimed = new Set(people.map((p) => p.email).filter(Boolean) as string[]);

  for (const { email, sourceUrl } of harvested) {
    if (claimed.has(email)) continue;

    const { firstName, lastName } = nameFromEmail(email);
    const owner = people.find((person) => {
      if (!person.name || person.email) return false;
      const name = normalise(person.name);
      return (
        name === normalise(`${firstName} ${lastName ?? ""}`) ||
        (lastName !== null &&
          name.includes(normalise(firstName)) &&
          name.includes(normalise(lastName)))
      );
    });

    if (owner) {
      owner.email = email;
    } else {
      people.push({ name: null, title: null, role: "UNKNOWN", email, sourceUrl });
    }
    claimed.add(email);
  }

  return people;
}
