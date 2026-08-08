/**
 * Port of `src/components/outreach/intent.tsx`.
 *
 * Pure presentation maps, so this is a plain module rather than an SFC.
 */
import type { ReplyIntent } from "~~/server/generated/prisma/client";
import type { Tone } from "~~/shared/tone";

/** Presentation for reply-intelligence classifications (plan §18). */
export const INTENT_LABELS: Record<ReplyIntent, string> = {
  INTERESTED: "Interested",
  NEEDS_INFO: "Needs info",
  NOT_INTERESTED: "Not interested",
  NOT_NOW: "Not now",
  REFERRED_TO_OTHER: "Referred on",
  OUT_OF_OFFICE: "Out of office",
  UNSUBSCRIBE: "Unsubscribe",
  AUTO_REPLY: "Auto reply",
  QUESTION: "Question",
  OTHER: "Other",
};

export const INTENT_TONES: Record<ReplyIntent, Tone> = {
  INTERESTED: "positive",
  NEEDS_INFO: "accent",
  NOT_INTERESTED: "danger",
  NOT_NOW: "warning",
  REFERRED_TO_OTHER: "accent",
  OUT_OF_OFFICE: "neutral",
  UNSUBSCRIBE: "danger",
  AUTO_REPLY: "neutral",
  QUESTION: "accent",
  OTHER: "neutral",
};

export const SENTIMENT_TONES: Record<string, Tone> = {
  POSITIVE: "positive",
  NEUTRAL: "neutral",
  NEGATIVE: "danger",
  MIXED: "warning",
};
