import { registerMockAgent, type MockInput } from "../providers/mock";
import type { ReplyOutput } from "../agents/reply";

/**
 * Mock generator for the reply agent.
 *
 * The generic JSON-Schema synthesiser can only invent field-shaped filler
 * ("questions (mock)"), which makes reply intelligence look broken in the
 * default keyless configuration. This reads the actual reply text and derives
 * intent, questions, objections, and the draft from what it finds — so a demo
 * with no API key shows real behaviour rather than placeholders.
 */

type Rule = {
  intent: ReplyOutput["intent"];
  sentiment: ReplyOutput["sentiment"];
  /** Any match promotes the reply to this classification. */
  patterns: RegExp[];
  followUpDays: number | null;
  pauseSequence: boolean;
};

const RULES: Rule[] = [
  {
    intent: "UNSUBSCRIBE",
    sentiment: "NEGATIVE",
    patterns: [/\bstop\b/i, /unsubscribe/i, /remove me/i, /do not contact/i],
    followUpDays: null,
    pauseSequence: true,
  },
  {
    intent: "OUT_OF_OFFICE",
    sentiment: "NEUTRAL",
    patterns: [/out of (the )?office/i, /automatic reply/i, /on leave/i, /annual leave/i],
    followUpDays: 7,
    pauseSequence: false,
  },
  // Explicit rejections only. "the systems we already have" is a buyer
  // describing their stack, not turning you down — treating it as a rejection
  // is exactly the misread that loses a live deal.
  {
    intent: "NOT_INTERESTED",
    sentiment: "NEGATIVE",
    patterns: [
      /not interested/i,
      /no,? thanks/i,
      /we(?:'re| are) all set/i,
      /already have a (?:solution|vendor|provider|partner)/i,
      /please don'?t (?:contact|email)/i,
    ],
    followUpDays: null,
    pauseSequence: true,
  },
  {
    intent: "NOT_NOW",
    sentiment: "MIXED",
    patterns: [
      /not right now/i,
      /not a priority/i,
      /next quarter/i,
      /this quarter/i,
      /revisit/i,
      /circle back/i,
      /busy season/i,
      /try me again/i,
      /after the new year/i,
      /(?:no|nobody has) bandwidth/i,
      /mid-?way through/i,
    ],
    followUpDays: 60,
    pauseSequence: true,
  },
  {
    intent: "REFERRED_TO_OTHER",
    sentiment: "NEUTRAL",
    patterns: [/speak to/i, /talk to/i, /forwarding|forwarded/i, /copying/i, /right person/i],
    followUpDays: 3,
    pauseSequence: true,
  },
  {
    intent: "NEEDS_INFO",
    sentiment: "POSITIVE",
    patterns: [/how much/i, /cost|price|pricing|budget/i, /how long/i, /timeline/i, /what would/i],
    followUpDays: 2,
    pauseSequence: true,
  },
  {
    intent: "INTERESTED",
    sentiment: "POSITIVE",
    patterns: [/interested/i, /happy to (chat|talk)/i, /sounds good/i, /let's (chat|talk|set)/i, /call/i],
    followUpDays: 2,
    pauseSequence: true,
  },
];

const OBJECTION_PATTERNS: { playbookKey: string; pattern: RegExp; text: string }[] = [
  { playbookKey: "too_expensive", pattern: /expensive|costly|budget is|too much/i, text: "Concerned about cost" },
  { playbookKey: "no_budget", pattern: /no budget|budget is (gone|spent)/i, text: "No budget allocated" },
  { playbookKey: "already_have_software", pattern: /already (have|use)|we use /i, text: "Already has software in place" },
  { playbookKey: "build_internally", pattern: /in-?house|our (own )?(dev|developer|IT)/i, text: "Considering building internally" },
  { playbookKey: "not_a_priority", pattern: /not a priority|other priorities|too busy/i, text: "Not currently a priority" },
  { playbookKey: "need_to_think", pattern: /think about|discuss internally|run it by/i, text: "Wants to think it over" },
  { playbookKey: "send_information", pattern: /send (me |over )?(some )?(info|information|details)/i, text: "Asked for information rather than a call" },
];

const BUYING_SIGNAL_PATTERNS: { pattern: RegExp; signal: string }[] = [
  { pattern: /how much|price|pricing|cost/i, signal: "Asked about price" },
  { pattern: /how long|timeline|when could/i, signal: "Asked about timeline" },
  { pattern: /call|meeting|chat|demo/i, signal: "Open to a conversation" },
  { pattern: /who else|our team|my (boss|partner)/i, signal: "Mentioned other people in the decision" },
  { pattern: /every (week|day|month)|hours (a|per) week/i, signal: "Quantified the manual effort" },
];

/** Sentences ending in a question mark, as the prospect wrote them. */
function extractQuestions(text: string): string[] {
  return (text.match(/[^.!?\n]*\?/g) ?? [])
    .map((q) => q.trim())
    .filter((q) => q.length > 8)
    .slice(0, 5);
}

function classify(text: string, questionCount: number): Rule {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule;
  }

  // A reply that asks questions is engagement, whatever else it contains.
  if (questionCount > 0) {
    return RULES.find((r) => r.intent === "NEEDS_INFO")!;
  }
  return {
    intent: "OTHER",
    sentiment: "NEUTRAL",
    patterns: [],
    followUpDays: 5,
    pauseSequence: true,
  };
}

const BLOCK = /--- BEGIN UNTRUSTED DOCUMENT [^\n]*---\n([\s\S]*?)\n--- END UNTRUSTED DOCUMENT/g;

/**
 * The reply agent wraps its documents into the instruction rather than passing
 * them as `request.data`, so reading `documents` alone finds nothing. Pull the
 * text back out of the untrusted blocks, and fall back to `documents` for
 * agents that do pass them separately.
 */
function sourceText(input: MockInput): string {
  const fromDocuments = input.documents.map((d) => d.content).join("\n\n").trim();
  if (fromDocuments) return fromDocuments;

  const blocks = [...input.request.instruction.matchAll(BLOCK)].map((m) => m[1]);
  return blocks.join("\n\n").trim();
}

export function generateMockReply(input: MockInput): ReplyOutput {
  const text = sourceText(input);
  const questions = extractQuestions(text);
  const rule = classify(text, questions.length);

  const objections = OBJECTION_PATTERNS.filter((o) => o.pattern.test(text)).map(
    ({ playbookKey, text: label }) => ({ text: label, playbookKey }),
  );
  const buyingSignals = BUYING_SIGNAL_PATTERNS.filter((s) => s.pattern.test(text)).map(
    (s) => s.signal,
  );

  const terminal = rule.intent === "UNSUBSCRIBE";
  const company = input.companyName || "the prospect";

  const summary = terminal
    ? `${company} asked not to be contacted again. Suppress the address and stop all sequences.`
    : `${company} replied: ${rule.intent.toLowerCase().replace(/_/g, " ")}.` +
      (questions.length ? ` They asked ${questions.length} question${questions.length > 1 ? "s" : ""}.` : "") +
      (objections.length ? ` Raised: ${objections.map((o) => o.text.toLowerCase()).join("; ")}.` : "");

  const recommendedAction = terminal
    ? "Add the address to the suppression list and close the thread."
    : rule.intent === "NEEDS_INFO"
      ? "Answer with ranges rather than a fixed quote, then ask for a 20-minute call."
      : rule.intent === "REFERRED_TO_OTHER"
        ? "Ask for an introduction to the person they named, and keep this contact copied."
        : rule.intent === "NOT_NOW"
          ? "Agree a specific date to revisit and record it as the next action."
          : rule.intent === "OUT_OF_OFFICE"
            ? "Wait until they are back before following up."
            : "Reply and propose two concrete times for a short call.";

  return {
    intent: rule.intent,
    sentiment: rule.sentiment,
    summary,
    questions,
    objections,
    buyingSignals,
    recommendedAction,
    suggestedFollowUpDays: rule.followUpDays,
    pauseSequence: rule.pauseSequence,
    optOutRequested: terminal,
    // Replying to an opt-out or an auto-reply would be wrong, so no draft.
    draftReply:
      terminal || rule.intent === "OUT_OF_OFFICE" || rule.intent === "NOT_INTERESTED"
        ? null
        : {
            subject: null,
            body: [
              "Thanks for coming back to me.",
              questions.length
                ? `On your question${questions.length > 1 ? "s" : ""} — the honest answer is that it depends on how much of the work is rekeying versus judgement, and I would rather look at the actual process than guess.`
                : "Rather than pitch, I would rather look at the actual process and tell you whether software is worth it.",
              "Would either of the next two afternoons work for twenty minutes?",
              "",
              "(Draft written by the built-in mock model.)",
            ].join("\n\n"),
          },
    confidence: input.seeded("reply-confidence", 0.55, 0.85),
  };
}

registerMockAgent("reply", generateMockReply as (input: MockInput) => unknown);
