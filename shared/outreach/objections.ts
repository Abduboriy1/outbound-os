/**
 * Objection library (plan §21).
 *
 * Reusable knowledge about the objections that actually come up, with response
 * guidance whose stated goal is to understand the objection and work out
 * whether the project genuinely makes sense. Nothing here is a rebuttal script
 * and nothing here is designed to overcome resistance: an objection that turns
 * out to be correct should end the conversation, and that is a good outcome.
 *
 * Pure data plus matching. The reply agent receives this as context so its
 * drafts stay consistent with what the user would say themselves.
 */

export type ObjectionKey =
  | "TOO_EXPENSIVE"
  | "NEED_TO_THINK"
  | "ALREADY_HAVE_SOFTWARE"
  | "BUILD_INTERNALLY"
  | "NOT_A_PRIORITY"
  | "SEND_INFORMATION"
  | "NO_BUDGET";

export type Objection = {
  key: ObjectionKey;
  label: string;
  /** What this objection usually means underneath. Read as hypotheses. */
  likelyMeanings: string[];
  /** Ask these before responding to anything. */
  understandFirst: string[];
  /** How to respond once you understand which meaning applies. */
  guidance: string;
  /** Tactics that are off limits, stated explicitly so drafts avoid them. */
  avoid: string[];
  /** When this objection is simply correct. */
  legitimateWhen: string;
  patterns: RegExp[];
};

export const OBJECTIONS: Objection[] = [
  {
    key: "TOO_EXPENSIVE",
    label: "Too expensive",
    likelyMeanings: [
      "The price is higher than the value they currently attach to the problem.",
      "They have no reference point for what this kind of work costs.",
      "The cost is fine but the risk of it not working is not.",
    ],
    understandFirst: [
      "Expensive compared with what - another quote, an internal estimate, or the cost of leaving it alone?",
      "What would the work need to be worth for the number to be reasonable?",
      "Is the concern the total, or committing the total before seeing anything work?",
    ],
    guidance:
      "Find out which of the three meanings it is before saying anything about price. If it is a value gap, go back to the cost of the current process using their numbers, not estimates. If it is a reference-point gap, give an honest range and what moves it. If it is risk, propose a smaller first piece that produces something usable on its own. Do not discount to win the conversation - a discount without a scope change tells them the first number was invented.",
    avoid: [
      "Discounting on the spot.",
      "Reframing the price as 'less than a coffee a day'.",
      "Implying they cannot afford to not do it.",
    ],
    legitimateWhen:
      "The work genuinely costs more than the problem costs them. Say so and stop.",
    patterns: [
      /\btoo (expensive|much|pricey|costly)\b/i,
      /\b(price|cost|quote)\s+(is|seems|feels|looks)\s+(high|steep|a lot)\b/i,
      /\bcan'?t justify\b/i,
      /\bout of (our )?(price )?range\b/i,
    ],
  },
  {
    key: "NEED_TO_THINK",
    label: "Need to think about it",
    likelyMeanings: [
      "There is an unspoken concern they did not want to raise directly.",
      "They are not the only decision maker.",
      "They are genuinely undecided and want time.",
    ],
    understandFirst: [
      "Which part is the open question - the approach, the cost, the timing, or whether it is the right problem to fix first?",
      "Who else would need to be comfortable with this?",
      "What would you need to know to decide either way?",
    ],
    guidance:
      "Treat it as a request for information, not as a stall. Ask which part is unresolved and answer that specific thing. Agree a concrete next contact rather than leaving it open, and make declining an explicitly acceptable answer.",
    avoid: [
      "Asking 'what is there to think about?'",
      "Creating a deadline that does not exist.",
      "Following up daily until they answer.",
    ],
    legitimateWhen:
      "It is a real decision with real consequences. Give them the time and a date to reconvene.",
    patterns: [
      /\b(need|want|have) to think\b/i,
      /\bthink (it|this) over\b/i,
      /\bget back to you\b/i,
      /\bdiscuss (it|this) (with|internally)\b/i,
      /\brun (it|this) (by|past)\b/i,
    ],
  },
  {
    key: "ALREADY_HAVE_SOFTWARE",
    label: "Already have software",
    likelyMeanings: [
      "They have a tool that covers part of the workflow and manual work fills the gaps.",
      "They bought something that is not really used.",
      "The tool genuinely solves it and there is no problem here.",
    ],
    understandFirst: [
      "Which part of the process does it handle, and which part still gets done by hand or in a spreadsheet?",
      "What happens between the systems - does anything get re-keyed?",
      "If it works well, is there another process that is more painful?",
    ],
    guidance:
      "Ask about the seams rather than the tool. Most of this work lives between systems, not inside them. If the existing software genuinely covers it, say so plainly and ask whether a different process is worse - or close the conversation.",
    avoid: [
      "Criticising the incumbent vendor.",
      "Implying they made a bad purchase.",
      "Positioning this as a replacement when it is an integration.",
    ],
    legitimateWhen:
      "The tool covers the workflow end to end. There is nothing to build.",
    patterns: [
      /\balready (have|use|using|got)\b/i,
      /\bwe use\s+\w+/i,
      /\b(current|existing) (system|software|tool|platform|solution)\b/i,
      /\bhappy with (our|the)\b/i,
    ],
  },
  {
    key: "BUILD_INTERNALLY",
    label: "We can build it internally",
    likelyMeanings: [
      "They have developers and this is genuinely within reach.",
      "They have developers who are fully committed to other work.",
      "They are testing whether the work is hard enough to be worth paying for.",
    ],
    understandFirst: [
      "Who would build it, and what would they stop doing to build it?",
      "Has it been on the list before? What happened?",
      "Who maintains it afterwards?",
    ],
    guidance:
      "Take the claim seriously - often it is true. The useful question is not capability but priority and maintenance. If they have the people and the time, say that building it themselves is the right call and offer to be useful on scope instead. Internal tools that never get built are usually a queueing problem, not a skills problem.",
    avoid: [
      "Suggesting their team is not capable.",
      "Inflating the difficulty of the work.",
      "Hidden-cost scare tactics.",
    ],
    legitimateWhen:
      "They have capacity and it is a small piece of work. Tell them to build it.",
    patterns: [
      /\bbuild (it|this|that)? ?(in[- ]?house|internally|ourselves)\b/i,
      /\b(we|our team) (have|has) (a )?develop(er|ers|ment)\b/i,
      /\bin[- ]?house (team|dev|developer)/i,
      /\bdo (it|this) ourselves\b/i,
    ],
  },
  {
    key: "NOT_A_PRIORITY",
    label: "Not a priority right now",
    likelyMeanings: [
      "Something larger is consuming attention this quarter.",
      "The pain is real but tolerable and nobody owns it.",
      "It is genuinely not important.",
    ],
    understandFirst: [
      "What is ahead of it right now?",
      "What would have to change for this to move up the list?",
      "When does the current project land?",
    ],
    guidance:
      "Accept it and get the timing right. Ask what is ahead of it and when that finishes, then agree a specific date to revisit. Between now and then, send something useful at most once - an observation or a relevant example, not a check-in.",
    avoid: [
      "Arguing that it should be a priority.",
      "Cost-of-inaction maths they did not ask for.",
      "Monthly 'just checking in' emails.",
    ],
    legitimateWhen:
      "Almost always. Priorities are real. Set a date and move on.",
    patterns: [
      /\bnot (a )?(top )?priority\b/i,
      /\bnot (right )?now\b/i,
      /\b(next|later this) (quarter|year|month)\b/i,
      /\bno bandwidth\b/i,
      /\btoo busy\b/i,
      /\bbad timing\b/i,
    ],
  },
  {
    key: "SEND_INFORMATION",
    label: "Send me some information",
    likelyMeanings: [
      "A polite way to end the conversation.",
      "They genuinely need something to circulate internally.",
      "They want to see evidence before spending time on a call.",
    ],
    understandFirst: [
      "What would be most useful - an example of similar work, or a rough outline of what this would involve for you?",
      "Is this for you, or for someone else who needs to see it?",
    ],
    guidance:
      "Send something specific rather than a generic deck, and ask what it is for. If they cannot say what would be useful, it is usually a polite no - accept that gracefully and leave the door open. One relevant case study beats a capabilities overview every time.",
    avoid: [
      "Sending a generic brochure and calling it personalised.",
      "Refusing to send anything without a call first.",
      "Treating the request as a commitment.",
    ],
    legitimateWhen:
      "They have to socialise it internally. Make the material easy to forward.",
    patterns: [
      /\bsend (me|us|over|through)\b/i,
      /\b(more|some) (information|info|details|material)\b/i,
      /\b(brochure|deck|one[- ]?pager|case stud(y|ies))\b/i,
    ],
  },
  {
    key: "NO_BUDGET",
    label: "No budget",
    likelyMeanings: [
      "There is no allocated budget line, but there is money.",
      "The budget cycle has closed and reopens on a known date.",
      "There is genuinely no money.",
    ],
    understandFirst: [
      "Is there no budget for this specifically, or none for this period?",
      "When does the next budget cycle start, and who sets it?",
      "If the numbers worked, whose budget would this come from?",
    ],
    guidance:
      "Separate 'no allocated budget' from 'no money'. The first is a timing and sponsorship question - find out when the cycle opens and what a request would need to contain. The second ends the conversation, and it should. Do not propose payment terms as a way around a decision that has already been made.",
    avoid: [
      "Implying budget can always be found for the right priority.",
      "Offering staged payments before understanding the actual constraint.",
      "Going around them to find someone with a budget.",
    ],
    legitimateWhen:
      "There is no money. Thank them, note the budget date, and stop contacting them until then.",
    patterns: [
      /\bno budget\b/i,
      /\bbudget (is )?(frozen|spent|gone|cut|committed)\b/i,
      /\bnot in (the|this) budget\b/i,
      /\bnext (budget|fiscal) (cycle|year)\b/i,
    ],
  },
];

const BY_KEY = new Map(OBJECTIONS.map((entry) => [entry.key, entry]));

export function getObjection(key: string): Objection | null {
  return BY_KEY.get(key as ObjectionKey) ?? null;
}

/** Every objection whose patterns appear in the text, in library order. */
export function matchObjections(text: string | null | undefined): Objection[] {
  if (!text?.trim()) return [];
  return OBJECTIONS.filter((objection) =>
    objection.patterns.some((pattern) => pattern.test(text)),
  );
}

export function matchObjection(text: string | null | undefined): Objection | null {
  return matchObjections(text)[0] ?? null;
}

/** Compact form handed to the reply agent as context. */
export function objectionPlaybook() {
  return OBJECTIONS.map((objection) => ({
    key: objection.key,
    label: objection.label,
    understandFirst: objection.understandFirst.join(" "),
    guidance: `${objection.guidance} Avoid: ${objection.avoid.join(" ")}`,
  }));
}
