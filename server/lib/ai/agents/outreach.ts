/**
 * OutreachAgent (plan §15, §16, §31).
 *
 * Builds a personalised first-contact message from what the research pipeline
 * actually found. The objective is a conversation, not a pitch: every variant
 * follows the same shape —
 *
 *     Observation -> problem hypothesis -> simple question -> low-friction CTA
 *
 * Prompt construction is pure and exported separately from the model call so
 * it can be tested without a provider, a database, or a network.
 *
 * Everything the prospect or the open web wrote (research snippets, their own
 * previous replies) is passed as `documents` — untrusted data, never
 * instruction (plan §36).
 */

import { z } from "zod";
import type { AgentName, AiRequest, UntrustedDocument } from "~~/server/lib/contracts";
import { systemPrompt, userTurn, type AgentRequest } from "~~/server/lib/ai/prompt";
import { jsonSchemaOf } from "~~/server/lib/ai/schema";
import {
  HINT_LABELS,
  OUTREACH_VARIANTS,
  REGENERATION_HINTS,
  VARIANT_LABELS,
  type OutreachVariant,
  type RegenerationHint,
} from "~~/shared/outreach/variants";

/* ---------------------------------------------------------------- inputs */

/**
 * The variant and hint vocabularies moved to `shared/outreach/variants.ts` so
 * the approval queue can label its own buttons (MIGRATION.md §1). The prompt
 * specs and the per-hint instructions below stay server-side.
 */
export { HINT_LABELS, OUTREACH_VARIANTS, REGENERATION_HINTS, VARIANT_LABELS };
export type { OutreachVariant, RegenerationHint };

type VariantSpec = {
  channel: "EMAIL" | "LINKEDIN";
  wantsSubject: boolean;
  maxWords: number;
  guidance: string;
};

export const VARIANT_SPECS: Record<OutreachVariant, VariantSpec> = {
  EMAIL: {
    channel: "EMAIL",
    wantsSubject: true,
    maxWords: 140,
    guidance:
      "A first-contact email. Lead with the specific observation about this company - not about us. One problem hypothesis, phrased as a hypothesis and not as a diagnosis. One question they can answer in a sentence. Close with a low-friction ask such as a short call or a yes/no reply.",
  },
  SHORT: {
    channel: "EMAIL",
    wantsSubject: true,
    maxWords: 70,
    guidance:
      "The same message compressed to under 70 words. Keep the observation and the question; drop context, adjectives, and any credential-dropping. It must still read as written by a person to one person.",
  },
  LINKEDIN_DM: {
    channel: "LINKEDIN",
    wantsSubject: false,
    maxWords: 60,
    guidance:
      "A LinkedIn or direct message. No subject line, no signature, no links. Conversational register, two short paragraphs at most, ending in a question.",
  },
  FOLLOW_UP: {
    channel: "EMAIL",
    wantsSubject: true,
    maxWords: 80,
    guidance:
      "A follow-up to earlier messages that went unanswered. Do not guilt, do not say 'just bumping this' or 'circling back', and never imply they were rude not to reply. Add one new piece of value or a sharper question, and make it easy to say no.",
  },
  REFERRAL_INTRO: {
    channel: "EMAIL",
    wantsSubject: true,
    maxWords: 110,
    guidance:
      "A request for an introduction. State plainly who we would be useful to and why, make the forward easy by including a two-sentence blurb they can pass on, and give them an explicit way to decline without awkwardness.",
  },
};



export const HINT_INSTRUCTIONS: Record<RegenerationHint, string> = {
  SHORTER:
    "Cut the previous draft by at least a third. Remove every sentence that is not the observation, the hypothesis, the question, or the ask.",
  FRIENDLIER:
    "Warmer and more human, without becoming familiar or using flattery. Contractions are fine. Do not add compliments about their website or their 'impressive growth'.",
  MORE_DIRECT:
    "Say the thing. Drop hedging, drop preamble, put the question in the first half of the message.",
  LESS_SALESY:
    "Remove all marketing register: no value propositions, no 'solutions', no 'leverage', no 'partner with you', no capability lists. It should read like one operator writing to another.",
  FOCUS_ON_ROI:
    "Centre the message on the cost of the current process - hours, headcount, error rework - and be explicit that the numbers are an estimate to be checked with them, not a claim about their business.",
  FOCUS_ON_AUTOMATION:
    "Centre the message on the specific repetitive workflow we believe they run manually, and what removing the manual step would change day to day.",
  DIFFERENT_QUESTION:
    "Keep the observation but ask a materially different question from the previous draft - a different angle on their process, not a rewording.",
};

export type OutreachClaim = {
  type: "FACT" | "INFERENCE" | "UNKNOWN";
  text: string;
  source?: string | null;
};

export type OutreachCaseStudy = {
  slug: string;
  title: string;
  industry: string;
  problem: string;
  businessResult: string;
};

export type PriorMessage = {
  direction: "OUTBOUND" | "INBOUND";
  subject?: string | null;
  body: string;
  sentAt: Date | string;
};

export type OutreachOffer = {
  /** What we actually sell, in the user's own words. */
  summary: string;
  /** The low-friction entry point, e.g. a free workflow review (plan §50). */
  entryPoint: string;
  /** Things we will not claim. */
  constraints?: string[];
};

export type OutreachInput = {
  variant: OutreachVariant;
  /** The user's preferred tone, straight from their profile. */
  tone: string;
  senderName: string;
  offer: OutreachOffer;
  company: {
    name: string;
    industry?: string | null;
    location?: string | null;
    employeeCount?: number | null;
    website?: string | null;
    description?: string | null;
  };
  contact: {
    firstName: string;
    lastName?: string | null;
    title?: string | null;
    decisionRole?: string | null;
  };
  /** Structured research output; claims keep their FACT/INFERENCE typing. */
  research?: {
    summary?: string | null;
    claims?: OutreachClaim[];
    painSignals?: string[];
  };
  /** The single hypothesis the message is built around. */
  painHypothesis?: string | null;
  opportunities?: {
    title: string;
    problem: string;
    solution: string;
    benefit?: string | null;
  }[];
  caseStudies?: OutreachCaseStudy[];
  priorMessages?: PriorMessage[];
  /** Why this lead surfaced now, shown in the approval queue. */
  reason?: string | null;
  score?: number | null;
  regenerationHint?: RegenerationHint | null;
  previousDraft?: { subject?: string | null; body: string } | null;
};

/* ---------------------------------------------------------------- output */

export const outreachOutputSchema = z.object({
  subject: z
    .string()
    .max(160)
    .nullable()
    .describe("Subject line, or null for channels that have none."),
  body: z.string().min(1).describe("The message body, plain text."),
  structure: z
    .object({
      observation: z.string(),
      problemHypothesis: z.string(),
      question: z.string(),
      cta: z.string(),
    })
    .describe("The four beats of the message, so a human can check the shape."),
  /** Which supporting material the model actually leaned on. */
  usedCaseStudySlugs: z.array(z.string()),
  claimsUsed: z
    .array(z.string())
    .describe("Facts from the research that the message asserts."),
  assumptions: z
    .array(z.string())
    .describe("Anything stated that is an inference rather than a known fact."),
  rationale: z.string().describe("Why this angle, in one or two sentences."),
  confidence: z.number().min(0).max(1),
});

export type OutreachOutput = z.infer<typeof outreachOutputSchema>;

/* ----------------------------------------------------------- system role */

const ROLE = `
You write first-contact sales messages for a solo software consultant who
builds business process automation and internal tools.

Your objective is to start a conversation, never to sell a project in the
message. A reply of "yes, that is a problem for us" is a success; a signed
contract is not the goal of this email.

Every message follows exactly four beats, in this order:
  1. Observation - one concrete, checkable thing about THIS company, drawn
     from the supplied research. If the research supports no specific
     observation, say so in rationale and write the most honest general
     opening you can rather than inventing a detail.
  2. Problem hypothesis - what that observation might mean operationally,
     stated as a hypothesis ("I would guess", "often this means"), never as a
     diagnosis of their business.
  3. Simple question - one question, answerable in a sentence, about how they
     currently handle it.
  4. Low-friction CTA - an easy yes or an easy no. Never a hard close, never
     a calendar link demand, never a fake deadline.

Hard rules:
- Never invent a metric, customer name, headcount, tool, or quotation. If it
  is not in the supplied research or case studies, it does not go in.
- Never state an inference as a fact. Anything you are not certain of must be
  hedged in the body and listed in "assumptions".
- No flattery, no "I came across your website and was impressed", no "hope
  this finds you well", no fake personalisation, no manufactured urgency.
- No merge-field placeholders. Write the finished text.
- Do not use a deceptive subject line and do not imply a prior conversation
  that did not happen.
- Do not add a signature block, unsubscribe line, or physical address: the
  application appends the compliance footer itself.
- Match the requested tone. When in doubt, be plainer and shorter.
`.trim();

/* ------------------------------------------------------- prompt building */

const MAX_PRIOR_MESSAGES = 6;
const MAX_CLAIMS = 20;

/**
 * Pure prompt construction. Returns everything but the agent name so the
 * service layer can stamp it.
 */
export function buildOutreachRequest(input: OutreachInput): AgentRequest {
  const spec = VARIANT_SPECS[input.variant];
  const claims = (input.research?.claims ?? []).slice(0, MAX_CLAIMS);

  const context: Record<string, unknown> = {
    variant: input.variant,
    channel: spec.channel,
    wantsSubject: spec.wantsSubject,
    maxWords: spec.maxWords,
    variantGuidance: spec.guidance,
    preferredTone: input.tone,
    senderName: input.senderName,
    offer: input.offer,
    company: compactCompany(input.company),
    contact: {
      firstName: input.contact.firstName,
      lastName: input.contact.lastName ?? undefined,
      title: input.contact.title ?? undefined,
      decisionRole: input.contact.decisionRole ?? undefined,
    },
    painHypothesis: input.painHypothesis ?? undefined,
    whyNow: input.reason ?? undefined,
    leadScore: input.score ?? undefined,
    researchSummary: input.research?.summary ?? undefined,
    painSignals: input.research?.painSignals?.length
      ? input.research.painSignals
      : undefined,
    facts: claims.filter((c) => c.type === "FACT").map(claimLine),
    inferences: claims.filter((c) => c.type === "INFERENCE").map(claimLine),
    opportunities: input.opportunities?.length ? input.opportunities : undefined,
    caseStudies: input.caseStudies?.length
      ? input.caseStudies.map((study) => ({
          slug: study.slug,
          title: study.title,
          industry: study.industry,
          problem: study.problem,
          result: study.businessResult,
        }))
      : undefined,
    conversationSoFar: summariseHistory(input.priorMessages ?? []),
  };

  if (input.regenerationHint) {
    context.regeneration = {
      hint: input.regenerationHint,
      label: HINT_LABELS[input.regenerationHint],
      instruction: HINT_INSTRUCTIONS[input.regenerationHint],
    };
    if (input.previousDraft) {
      context.previousDraft = {
        subject: input.previousDraft.subject ?? undefined,
        body: input.previousDraft.body,
      };
    }
  }

  return {
    system: systemPrompt(ROLE),
    instruction: userTurn({
      task: buildTask(input, spec),
      context,
      documents: buildDocuments(input),
    }),
    responseSchema: jsonSchemaOf(outreachOutputSchema),
    maxTokens: 1400,
    // Slightly above zero: identical phrasing across every prospect is the
    // exact failure mode this agent exists to avoid. Regeneration lifts it
    // further so a second pass is not the first draft again.
    temperature: input.regenerationHint ? 0.8 : 0.6,
  };
}

export function buildTask(input: OutreachInput, spec: VariantSpec): string {
  const who = [input.contact.firstName, input.contact.lastName]
    .filter(Boolean)
    .join(" ");
  const role = input.contact.title ? ` (${input.contact.title})` : "";

  const lines = [
    `Write a ${VARIANT_LABELS[input.variant].toLowerCase()} to ${who}${role} at ${input.company.name}.`,
    spec.guidance,
    `Hard limit: ${spec.maxWords} words in the body.`,
    spec.wantsSubject
      ? "Include a plain, specific, non-clickbait subject line."
      : "This channel has no subject line: return null for subject.",
  ];

  if (input.regenerationHint) {
    lines.push(
      `This is a REGENERATION of the previous draft supplied in the context. Apply this change: ${HINT_INSTRUCTIONS[input.regenerationHint]}`,
      "Keep everything that was working. Do not restart from scratch unless the hint requires it.",
    );
  }

  if (input.variant === "FOLLOW_UP") {
    lines.push(
      "Read the conversation so far before writing. If they already answered the question you were going to ask, ask the next one instead.",
    );
  }

  lines.push(
    "Return JSON only, matching the schema. Put the finished text in `body`; do not repeat the subject inside the body.",
  );

  return lines.join("\n");
}

/**
 * Untrusted material: research snippets and anything the prospect wrote. These
 * go in documents, never in the instruction (plan §36).
 */
export function buildDocuments(input: OutreachInput): UntrustedDocument[] {
  const documents: UntrustedDocument[] = [];

  if (input.company.description?.trim()) {
    documents.push({
      label: `${input.company.name} - public description`,
      url: input.company.website ?? undefined,
      content: input.company.description,
    });
  }

  for (const claim of input.research?.claims ?? []) {
    if (!claim.source) continue;
    documents.push({
      label: `research source (${claim.type.toLowerCase()})`,
      url: claim.source,
      content: claim.text,
    });
  }

  for (const message of (input.priorMessages ?? [])
    .filter((m) => m.direction === "INBOUND")
    .slice(-MAX_PRIOR_MESSAGES)) {
    documents.push({
      label: `reply from the prospect${message.subject ? ` - ${message.subject}` : ""}`,
      content: message.body,
    });
  }

  return documents;
}

function claimLine(claim: OutreachClaim) {
  return claim.source ? `${claim.text} [${claim.source}]` : claim.text;
}

function compactCompany(company: OutreachInput["company"]) {
  return {
    name: company.name,
    industry: company.industry ?? undefined,
    location: company.location ?? undefined,
    employeeCount: company.employeeCount ?? undefined,
    website: company.website ?? undefined,
  };
}

/**
 * Our own sent messages are first-party and safe in the context; the
 * prospect's words are summarised here but carried as documents.
 */
export function summariseHistory(messages: PriorMessage[]) {
  return messages.slice(-MAX_PRIOR_MESSAGES).map((message) => ({
    direction: message.direction,
    sentAt: toIso(message.sentAt),
    subject: message.subject ?? undefined,
    text:
      message.direction === "OUTBOUND"
        ? message.body.slice(0, 1200)
        : "(the prospect's reply is supplied as an untrusted document below)",
  }));
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

/* --------------------------------------------------------------- runner */

/**
 * Structural view of `AIService` (plan §31), matching `RunOptions` /
 * `AiRunResult` in `~~/server/lib/ai/service`. Declared structurally so the agents can
 * be unit tested without constructing the service or a provider.
 */
export interface AgentRunner {
  run<T>(input: {
    agent: AgentName;
    userId: string;
    leadId?: string | null;
    request: AgentRequest;
    schema: z.ZodType<T>;
  }): Promise<{ data: T; runId: string }>;
}

export async function runOutreachAgent(
  runner: AgentRunner,
  args: { userId: string; leadId: string; input: OutreachInput },
): Promise<{ data: OutreachOutput; runId: string }> {
  return runner.run({
    agent: "outreach",
    userId: args.userId,
    leadId: args.leadId,
    request: buildOutreachRequest(args.input),
    schema: outreachOutputSchema,
  });
}

export function isRegenerationHint(
  value: string | null | undefined,
): value is RegenerationHint {
  return (
    !!value && (REGENERATION_HINTS as readonly string[]).includes(value)
  );
}

export function isOutreachVariant(
  value: string | null | undefined,
): value is OutreachVariant {
  return !!value && (OUTREACH_VARIANTS as readonly string[]).includes(value);
}

export type { AiRequest };
