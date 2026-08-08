import type { ReplyIntent } from "~~/server/generated/prisma/client";
import { rate } from "./funnel";
import type { ReplyRow, SentMessageRow } from "./types";

/**
 * Intents that mean the conversation is alive. Out-of-office and auto-replies
 * are machine noise and must not inflate the reply rate, so they are excluded
 * from the denominator-facing counts entirely (plan §18, §30).
 */
export const POSITIVE_INTENTS: ReplyIntent[] = [
  "INTERESTED",
  "NEEDS_INFO",
  "QUESTION",
  "REFERRED_TO_OTHER",
];

export const AUTOMATED_INTENTS: ReplyIntent[] = ["AUTO_REPLY", "OUT_OF_OFFICE"];

export type OutreachSummary = {
  sent: number;
  bounced: number;
  bounceRate: number;
  /** Replies from a person, excluding auto-responders. */
  replies: number;
  replyRate: number;
  positiveReplies: number;
  positiveReplyRate: number;
  /** Positive replies as a share of replies, not of sends. */
  positiveOfReplies: number;
  optOuts: number;
  optOutRate: number;
};

export function computeOutreachStats(
  sent: SentMessageRow[],
  replies: ReplyRow[],
  optOutCount = 0,
): OutreachSummary {
  const sentCount = sent.filter((m) => m.sentAt !== null).length;
  const bounced = sent.filter((m) => m.bounced).length;
  const delivered = Math.max(0, sentCount - bounced);

  const human = replies.filter(
    (r) => r.intent === null || !AUTOMATED_INTENTS.includes(r.intent),
  );
  const positive = human.filter(
    (r) => r.intent !== null && POSITIVE_INTENTS.includes(r.intent),
  );
  const optOuts =
    optOutCount + replies.filter((r) => r.intent === "UNSUBSCRIBE").length;

  return {
    sent: sentCount,
    bounced,
    bounceRate: rate(bounced, sentCount),
    replies: human.length,
    replyRate: rate(human.length, delivered),
    positiveReplies: positive.length,
    positiveReplyRate: rate(positive.length, delivered),
    positiveOfReplies: rate(positive.length, human.length),
    optOuts,
    optOutRate: rate(optOuts, delivered),
  };
}
