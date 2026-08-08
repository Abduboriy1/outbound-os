/**
 * The parts of `src/app/(app)/settings/providers.ts` and `provider-card.tsx`
 * that both halves need.
 *
 * `providerStatuses()` itself stays on the server — it reads `env()` — and is
 * exposed as `GET /api/settings/providers`. Only the shape it returns and the
 * static DNS checklist live here, so the pages can type the response and render
 * the checklist without a round trip.
 */

export type ProviderStatus = {
  title: string;
  /** The provider that is actually in use right now. */
  active: string;
  isMock: boolean;
  description: string;
  /** What has to be true before the real provider can be selected. */
  requirements: { label: string; met: boolean }[];
  /** The environment change that switches it on. */
  switchTo?: string;
};

export type ProviderStatuses = Record<"ai" | "email" | "search", ProviderStatus>;

/** Plan §37 — the domain authentication checklist, as guidance not detection. */
export const DNS_CHECKLIST = [
  {
    record: "SPF",
    what: "A TXT record on the sending domain listing who may send for it.",
    example: "v=spf1 include:_spf.google.com ~all",
    why: "Without it, receivers cannot tell your mail from a forgery.",
  },
  {
    record: "DKIM",
    what: "A public key published by your mail provider, signing every message.",
    example: "google._domainkey  TXT  v=DKIM1; k=rsa; p=...",
    why: "Proves the message was not altered in transit.",
  },
  {
    record: "DMARC",
    what: "A policy telling receivers what to do when SPF and DKIM fail.",
    example: "_dmarc  TXT  v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com",
    why: "Start at p=none to collect reports, then tighten to quarantine.",
  },
  {
    record: "Reverse DNS / MX",
    what: "The sending domain resolves and accepts mail.",
    example: "MX  1  aspmx.l.google.com",
    why: "A domain that cannot receive replies looks disposable.",
  },
] as const;
