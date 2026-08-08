/**
 * Bounce and opt-out detection (plan §17).
 *
 * Pure string analysis over an incoming message. Everything here is data
 * inspection only — nothing in a prospect's reply is ever treated as an
 * instruction (plan §36). The result feeds the suppression list, which is why
 * these rules are conservative: a false positive costs one lost conversation,
 * a false negative means contacting someone who asked us to stop.
 */

import type { IncomingEmail } from "~~/server/lib/contracts";

export type BounceKind = "HARD" | "SOFT" | "NONE";

export type BounceDetection = {
  isBounce: boolean;
  kind: BounceKind;
  /** The address that could not be delivered to, when the report names it. */
  failedRecipient: string | null;
  reason: string | null;
};

const DAEMON_SENDERS =
  /(mailer-daemon|postmaster|no-?reply@.*(mail|smtp)|delivery-?(status|subsystem))/i;

const BOUNCE_SUBJECTS =
  /(undeliverable|undelivered mail|delivery status notification|returned mail|mail delivery (failed|subsystem)|delivery has failed|failure notice|message not delivered)/i;

/** RFC 3463 enhanced status codes: 5.x.x is permanent, 4.x.x transient. */
const HARD_STATUS = /\b5\.\d{1,3}\.\d{1,3}\b/;
const SOFT_STATUS = /\b4\.\d{1,3}\.\d{1,3}\b/;

const HARD_PHRASES =
  /(user unknown|no such user|does not exist|address (not found|rejected)|recipient (address )?rejected|unknown recipient|mailbox unavailable|account (has been )?disabled)/i;

const SOFT_PHRASES =
  /(mailbox full|over quota|quota exceeded|temporarily (unavailable|deferred)|try again later|greylist)/i;

const FINAL_RECIPIENT =
  /(?:final-recipient|original-recipient)\s*:\s*(?:rfc822\s*;\s*)?<?([^\s<>;]+@[^\s<>;]+)>?/i;

const FAILED_TO =
  /(?:to|recipient)\s*[:=]?\s*<([^\s<>]+@[^\s<>]+)>/i;

export function detectBounce(
  email: Pick<IncomingEmail, "from" | "subject" | "body"> & {
    isBounce?: boolean;
  },
): BounceDetection {
  const from = email.from ?? "";
  const subject = email.subject ?? "";
  const body = email.body ?? "";
  const haystack = `${subject}\n${body}`;

  const looksLikeReport =
    email.isBounce === true ||
    DAEMON_SENDERS.test(from) ||
    BOUNCE_SUBJECTS.test(subject);

  if (!looksLikeReport) {
    return { isBounce: false, kind: "NONE", failedRecipient: null, reason: null };
  }

  const hard = HARD_STATUS.test(haystack) || HARD_PHRASES.test(haystack);
  const soft = SOFT_STATUS.test(haystack) || SOFT_PHRASES.test(haystack);
  // A report with no recognisable status code is treated as permanent: we
  // would rather stop mailing an address than keep retrying a dead mailbox.
  const kind: BounceKind = hard ? "HARD" : soft ? "SOFT" : "HARD";

  const match = FINAL_RECIPIENT.exec(body) ?? FAILED_TO.exec(body);

  return {
    isBounce: true,
    kind,
    failedRecipient: match ? match[1].trim().toLowerCase() : null,
    reason: firstStatusLine(haystack) ?? subject.trim() ?? null,
  };
}

function firstStatusLine(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (HARD_STATUS.test(line) || SOFT_STATUS.test(line)) return line.trim();
    if (HARD_PHRASES.test(line) || SOFT_PHRASES.test(line)) return line.trim();
  }
  return null;
}

/* -------------------------------------------------------------- opt-out */

export type OptOutDetection = {
  isOptOut: boolean;
  matchedPhrase: string | null;
};

// Ordered most-specific first so the matched phrase we report is the useful
// one when a reply contains several.
const OPT_OUT_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "unsubscribe", pattern: /\bunsubscrib(e|ed|ing)\b/i },
  { label: "remove me", pattern: /\b(remove|take)\s+(me|us)\s+(off|from)\b/i },
  { label: "do not contact", pattern: /\b(do not|don'?t|please don'?t)\s+(contact|email|e-mail|message|write to)\s+(me|us)\b/i },
  { label: "opt out", pattern: /\bopt(\s|-)?out\b/i },
  { label: "not interested, stop", pattern: /\bstop\s+(emailing|contacting|messaging)\b/i },
  { label: "no further contact", pattern: /\bno (further|more)\s+(contact|emails?|messages?)\b/i },
  { label: "delete my data", pattern: /\b(delete|erase)\s+(my|our)\s+(data|details|information)\b/i },
];

/** A bare "STOP" on its own line is the conventional opt-out keyword. */
const BARE_STOP = /^\s*stop[.!]?\s*$/im;

export function detectOptOut(text: string | null | undefined): OptOutDetection {
  const body = stripQuotedReply(text ?? "");
  if (!body.trim()) return { isOptOut: false, matchedPhrase: null };

  for (const { label, pattern } of OPT_OUT_PATTERNS) {
    if (pattern.test(body)) return { isOptOut: true, matchedPhrase: label };
  }
  if (BARE_STOP.test(body)) return { isOptOut: true, matchedPhrase: "stop" };
  return { isOptOut: false, matchedPhrase: null };
}

/**
 * Drops the quoted portion of a reply. Without this, our own footer ("Reply
 * STOP and I won't contact you again") quoted back would register as an
 * opt-out on every single reply.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*On .+wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line)) break;
    if (/^\s*From:\s*.+@/.test(line)) break;
    if (/^-- $/.test(line)) break;
    kept.push(line);
  }
  return kept.join("\n");
}

/* ----------------------------------------------------------- auto-reply */

const AUTO_REPLY =
  /(out of (the )?office|automatic reply|auto-?reply|on (annual |parental |vacation )?leave|away from (the|my) (office|desk)|currently (out|away)|maternity leave)/i;

export function detectAutoReply(
  email: Pick<IncomingEmail, "subject" | "body">,
): boolean {
  return AUTO_REPLY.test(`${email.subject ?? ""}\n${email.body ?? ""}`);
}
