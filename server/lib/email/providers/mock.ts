/**
 * Default email provider (plan §35). It never touches the network.
 *
 * `send` records the message as an audit row and hands back synthetic
 * provider ids — the `EmailThread` / `EmailMessage` rows are written by the
 * send pipeline, which is provider-agnostic.
 *
 * `fetchIncoming` synthesises replies to messages the app has actually sent,
 * choosing a scenario deterministically from the message id. That gives reply
 * intelligence a realistic, repeatable corpus (interested, price question,
 * not now, out of office, unsubscribe, bounce) with no Gmail account.
 */

import { prisma } from "~~/server/lib/db";
import { audit } from "~~/server/lib/audit";
import type {
  EmailProvider,
  IncomingEmail,
  OutgoingEmail,
  SentEmail,
} from "~~/server/lib/contracts";

export type MockScenarioKey =
  | "INTERESTED"
  | "PRICE_QUESTION"
  | "NOT_NOW"
  | "OUT_OF_OFFICE"
  | "UNSUBSCRIBE"
  | "BOUNCE";

export type MockScenario = {
  key: MockScenarioKey;
  /** Prefix applied to the original subject, `Re:` for genuine replies. */
  subjectPrefix: string;
  isBounce: boolean;
  /** Minutes after the outbound message that the reply arrives. */
  delayMinutes: number;
  body: (ctx: MockReplyContext) => string;
};

export type MockReplyContext = {
  /** Recipient of the original outbound message — the person replying. */
  contactEmail: string;
  senderEmail: string;
  subject: string;
};

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    key: "INTERESTED",
    subjectPrefix: "Re: ",
    isBounce: false,
    delayMinutes: 95,
    body: () =>
      [
        "Thanks for reaching out - your timing is decent actually.",
        "",
        "We do rebuild the same operations report by hand every Monday and it",
        "eats most of a day between two people. I would be open to a short call",
        "to see what this would involve. Next Tuesday or Wednesday afternoon",
        "would work on our side.",
        "",
        "One thing I would want to understand is how much of our existing",
        "spreadsheet logic would have to be rewritten.",
      ].join("\n"),
  },
  {
    key: "PRICE_QUESTION",
    subjectPrefix: "Re: ",
    isBounce: false,
    delayMinutes: 140,
    body: () =>
      [
        "Interesting, thanks.",
        "",
        "Before we book anything: what does something like this typically cost,",
        "and how long does implementation take? We have been burned by a six",
        "month project before so I am cautious.",
        "",
        "Also, do you work with the systems we already have or does everything",
        "need replacing?",
      ].join("\n"),
  },
  {
    key: "NOT_NOW",
    subjectPrefix: "Re: ",
    isBounce: false,
    delayMinutes: 210,
    body: () =>
      [
        "Appreciate the note. This is a real problem for us but it is not a",
        "priority this quarter - we are mid-way through an ERP migration and",
        "nobody has bandwidth.",
        "",
        "Try me again after the new year and I will have a clearer picture.",
      ].join("\n"),
  },
  {
    key: "OUT_OF_OFFICE",
    subjectPrefix: "Automatic reply: ",
    isBounce: false,
    delayMinutes: 2,
    body: (ctx) =>
      [
        "I am currently out of the office with limited access to email and will",
        "return on the 14th.",
        "",
        "For anything urgent please contact operations@example.com.",
        "",
        `This is an automatic reply to ${ctx.senderEmail}.`,
      ].join("\n"),
  },
  {
    key: "UNSUBSCRIBE",
    subjectPrefix: "Re: ",
    isBounce: false,
    delayMinutes: 45,
    body: () =>
      [
        "Please remove me from your list and do not contact me again.",
        "",
        "Unsubscribe.",
      ].join("\n"),
  },
  {
    key: "BOUNCE",
    subjectPrefix: "Undeliverable: ",
    isBounce: true,
    delayMinutes: 1,
    body: (ctx) =>
      [
        "Delivery to the following recipient failed permanently:",
        "",
        `    ${ctx.contactEmail}`,
        "",
        "Technical details of permanent failure:",
        "550 5.1.1 The email account that you tried to reach does not exist.",
        "",
        "Reporting-MTA: dns; mock.local",
        `Final-Recipient: rfc822; ${ctx.contactEmail}`,
        "Action: failed",
        "Status: 5.1.1",
      ].join("\n"),
  },
];

/** FNV-1a — small, deterministic, and stable across Node versions. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function pickScenario(seed: string): MockScenario {
  return MOCK_SCENARIOS[hashSeed(seed) % MOCK_SCENARIOS.length];
}

export function scenarioByKey(key: MockScenarioKey): MockScenario {
  const found = MOCK_SCENARIOS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown mock scenario ${key}`);
  return found;
}

export type MockSourceMessage = {
  id: string;
  providerMessageId: string | null;
  providerThreadId: string | null;
  fromEmail: string;
  toEmail: string;
  subject: string | null;
  sentAt: Date;
};

/** Pure: turns an outbound message plus a scenario into an incoming reply. */
export function buildMockReply(
  source: MockSourceMessage,
  scenario: MockScenario,
): IncomingEmail {
  const subject = source.subject ?? "(no subject)";
  const ctx: MockReplyContext = {
    contactEmail: source.toEmail,
    senderEmail: source.fromEmail,
    subject,
  };
  const body = scenario.body(ctx);
  // Clamped to the present: a future-dated reply would push the ingest
  // watermark past every message sent afterwards.
  const receivedAt = new Date(
    Math.min(
      source.sentAt.getTime() + scenario.delayMinutes * 60_000,
      Date.now(),
    ),
  );

  return {
    providerMessageId: `mock-reply-${source.id}`,
    providerThreadId: source.providerThreadId ?? `mock-thread-${source.id}`,
    // A bounce comes from the mail system, a real reply from the prospect.
    from: scenario.isBounce ? "mailer-daemon@mock.local" : source.toEmail,
    to: source.fromEmail,
    subject: `${scenario.subjectPrefix}${subject}`,
    body,
    snippet: body.split("\n").find((line) => line.trim())?.slice(0, 160) ?? "",
    receivedAt,
    isBounce: scenario.isBounce,
  };
}

/* -------------------------------------------------------------- provider */

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";

  constructor(private readonly userId?: string) {}

  async send(email: OutgoingEmail): Promise<SentEmail> {
    const sentAt = new Date();
    const providerMessageId = `mock-msg-${hashSeed(
      `${email.to}${email.subject}${sentAt.toISOString()}`,
    ).toString(16)}-${sentAt.getTime()}`;
    const providerThreadId =
      email.threadId ?? `mock-thread-${hashSeed(`${email.to}${email.subject}`).toString(16)}`;

    // The mock still leaves a durable record of exactly what would have gone
    // out, so a demo can prove nothing was sent without approval.
    await audit({
      userId: this.userId ?? null,
      actorType: "SYSTEM",
      action: "email.mock.send",
      entityType: "email",
      entityId: providerMessageId,
      metadata: {
        to: email.to,
        from: email.from,
        subject: email.subject,
        threadId: providerThreadId,
        bodyPreview: email.body.slice(0, 2000),
      },
    });

    return { providerMessageId, providerThreadId, sentAt };
  }

  /**
   * Answers outbound messages that nobody has replied to yet. Ids are derived
   * from the source message, so polling repeatedly is idempotent.
   */
  async fetchIncoming(since: Date): Promise<IncomingEmail[]> {
    const outbound = await prisma.emailMessage.findMany({
      where: {
        direction: "OUTBOUND",
        sentAt: { gte: since },
        thread: {
          ...(this.userId ? { lead: { userId: this.userId } } : {}),
          messages: { none: { direction: "INBOUND" } },
        },
      },
      select: {
        id: true,
        providerMessageId: true,
        fromEmail: true,
        toEmail: true,
        subject: true,
        sentAt: true,
        thread: { select: { providerThreadId: true } },
      },
      orderBy: { sentAt: "asc" },
      take: 25,
    });

    return outbound.map((message) =>
      buildMockReply(
        {
          id: message.id,
          providerMessageId: message.providerMessageId,
          providerThreadId: message.thread.providerThreadId,
          fromEmail: message.fromEmail,
          toEmail: message.toEmail,
          subject: message.subject,
          sentAt: message.sentAt,
        },
        pickScenario(message.id),
      ),
    );
  }
}
