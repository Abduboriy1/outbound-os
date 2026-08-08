/**
 * Outreach templates (plan §15, §16).
 *
 * These are not mail-merge templates to be blasted out. They are the skeletons
 * the outreach agent is steered toward and the reference a human edits against
 * in the approval queue — each one is the Observation -> hypothesis ->
 * question -> low-friction CTA shape with the reasoning made explicit.
 *
 * Placeholders are written as {{name}} and are filled by a person or by the
 * agent, never left in a sent message: the approval queue refuses to send a
 * body that still contains one.
 */

import type { OutreachVariant } from "./variants";

export type OutreachTemplate = {
  key: string;
  name: string;
  variant: OutreachVariant;
  /** The situation this template is for. */
  useWhen: string;
  subject: string | null;
  body: string;
  /** Why each beat is written the way it is. */
  notes: string[];
};

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    key: "manual-reporting",
    name: "Manual reporting signal",
    variant: "EMAIL",
    useWhen:
      "Research found evidence that reports are assembled by hand - a job advert asking for advanced Excel, a careers page mentioning weekly reporting, an operations role that is mostly data collation.",
    subject: "{{company}} weekly reporting",
    body: [
      "Hi {{firstName}},",
      "",
      "I noticed {{observation}}.",
      "",
      "In most companies that shape, that report gets rebuilt by hand every week -",
      "pulling from two or three systems, reconciling, then formatting. I could be",
      "wrong about yours.",
      "",
      "How is that put together at the moment?",
      "",
      "If it is manual and it is annoying, I map that kind of process for free and",
      "tell you whether it is worth automating. No obligation either way.",
    ].join("\n"),
    notes: [
      "The observation is checkable and specific; a generic 'I was impressed by your website' opener is worse than no opener.",
      "The hypothesis is hedged twice ('in most companies', 'I could be wrong') because it is an inference.",
      "One question, answerable in a sentence.",
      "The CTA is a free review, not a meeting request.",
    ],
  },
  {
    key: "disconnected-systems",
    name: "Systems that do not talk",
    variant: "EMAIL",
    useWhen:
      "Research shows two or more named systems in use with no integration layer, or a job advert mentions re-keying data between them.",
    subject: "{{systemA}} and {{systemB}}",
    body: [
      "Hi {{firstName}},",
      "",
      "I saw {{observation}}.",
      "",
      "Usually when those two sit side by side, somebody ends up copying records",
      "from one into the other - and that person notices every time it goes wrong.",
      "",
      "Does anything move between them by hand today?",
      "",
      "If so I would be happy to look at it and tell you what it would take to",
      "close the gap. Or tell you it is not worth closing.",
    ].join("\n"),
    notes: [
      "Names the systems the research actually found - never a guess.",
      "The question is a yes/no, which is the easiest thing to answer.",
    ],
  },
  {
    key: "short-version",
    name: "Short version",
    variant: "SHORT",
    useWhen:
      "Senior contacts, or a second attempt at a company where the longer version got no reply.",
    subject: "{{topic}}",
    body: [
      "Hi {{firstName}},",
      "",
      "{{observation}} - which usually means {{hypothesis}}.",
      "",
      "Is that how it works at {{company}}?",
      "",
      "If it is, I will tell you for free whether it is worth fixing.",
    ].join("\n"),
    notes: [
      "Under 60 words. Everything that is not one of the four beats is gone.",
      "No credentials, no company blurb, no links.",
    ],
  },
  {
    key: "linkedin-dm",
    name: "LinkedIn message",
    variant: "LINKEDIN_DM",
    useWhen:
      "No email address, or email has been tried without a reply and a different channel is reasonable.",
    subject: null,
    body: [
      "Hi {{firstName}} - {{observation}}.",
      "",
      "Curious how you handle {{process}} at the moment. I build automation for",
      "exactly that kind of thing, but I am mostly interested in whether it is",
      "actually a problem for you.",
    ].join("\n"),
    notes: [
      "No subject, no signature, no links - links reduce delivery and read as marketing.",
      "Ends on a question, not an ask.",
    ],
  },
  {
    key: "follow-up",
    name: "Follow-up after no reply",
    variant: "FOLLOW_UP",
    useWhen:
      "Four or more days after the previous message with no reply. Use at most twice.",
    subject: "Re: {{previousSubject}}",
    body: [
      "Hi {{firstName}},",
      "",
      "Following up on the note below. Since I sent it I came across",
      "{{newObservation}}, which made me think the question was worth asking",
      "again.",
      "",
      "{{sharperQuestion}}",
      "",
      "If this is not a priority, say so and I will leave it - no hard feelings.",
    ].join("\n"),
    notes: [
      "Adds something new. A follow-up that only repeats the first message is a nag.",
      "Never 'just bumping this to the top of your inbox'.",
      "Explicitly makes 'no' an easy answer, which is what gets a reply.",
    ],
  },
  {
    key: "referral-intro",
    name: "Referral introduction request",
    variant: "REFERRAL_INTRO",
    useWhen:
      "A happy client, or a contact who said this is not for them but was warm about it.",
    subject: "A quick introduction?",
    body: [
      "Hi {{firstName}},",
      "",
      "{{context}}",
      "",
      "I am looking for one or two more companies with the same {{problem}}",
      "problem. If anyone comes to mind, would you be willing to forward this?",
      "",
      "Something you could paste:",
      "",
      "  \"{{senderName}} builds internal tools and automation for {{industry}}",
      "  companies. Worth a short conversation if {{problem}} sounds familiar.\"",
      "",
      "And if nobody comes to mind, that is a perfectly good answer.",
    ].join("\n"),
    notes: [
      "Includes the forwardable blurb so the favour costs them thirty seconds.",
      "Gives explicit permission to decline, which is what makes the ask fair.",
    ],
  },
];

export function templateByKey(key: string): OutreachTemplate | null {
  return OUTREACH_TEMPLATES.find((template) => template.key === key) ?? null;
}

export const PLACEHOLDER_PATTERN = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g;

/** Placeholders left in a body. A non-empty result blocks approval. */
export function findPlaceholders(body: string): string[] {
  return Array.from(new Set(body.match(PLACEHOLDER_PATTERN) ?? []));
}

export function fillTemplate(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(PLACEHOLDER_PATTERN, (match) => {
    const key = match.replace(/[{}\s]/g, "");
    return values[key] ?? match;
  });
}
