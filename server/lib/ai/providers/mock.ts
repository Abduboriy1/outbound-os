/**
 * Deterministic mock AI provider — the default (plan §35, CONVENTIONS).
 *
 * The whole product has to be usable with no API keys, and a demo is worthless
 * if the output is obviously canned. So this provider does real work: it reads
 * the structured context the agent supplied, scans the actual retrieved
 * documents for pain signals, and quotes the sentences it found. The company
 * name, the evidence, and the source URLs are all genuine — the only thing
 * simulated is the language model.
 *
 * Two rules it never breaks:
 *  - It never invents a source URL. If a claim has no supplied source, the
 *    claim is an INFERENCE or UNKNOWN with a null url.
 *  - Identical input produces identical output, so tests and demos are stable.
 *
 * Agents owned by other work streams (outreach, reply, proposal) are covered by
 * a schema-driven fallback, and can register a richer generator through
 * `registerMockAgent` without touching this file.
 */

import type {
  AgentName,
  AiProvider,
  AiRequest,
  AiResponse,
  GroundedRequest,
  GroundedResponse,
  GroundedSearchProvider,
  UntrustedDocument,
} from "~~/server/lib/contracts";
import { readContext } from "../prompt";
import { detectInjection } from "../sanitize";
import {
  SIGNAL_HYPOTHESES,
  SIGNAL_RULES,
  detectSignals,
  distinctTypes,
  type DetectedSignal,
  type SignalType,
} from "~~/server/lib/research/signals";

export const MOCK_MODEL = "mock-deterministic-v1";
export const MOCK_PROVIDER = "mock";

export type MockGenerator = (input: MockInput) => unknown;

export type MockInput = {
  request: AiRequest;
  context: Record<string, unknown>;
  documents: UntrustedDocument[];
  signals: DetectedSignal[];
  companyName: string;
  /** Deterministic 0-1 value seeded from the request; use for confidences. */
  seeded: (salt: string, min: number, max: number) => number;
};

const generators = new Map<AgentName, MockGenerator>();

/** Lets another work stream supply a richer mock for its own agent. */
export function registerMockAgent(agent: AgentName, generator: MockGenerator) {
  generators.set(agent, generator);
}

/** Sample companies the mock lead finder "discovers". Fictional by construction. */
const SAMPLE_PROSPECTS = [
  { name: "Northgate Freight", domain: "northgate-freight.example", industry: "Logistics", location: "Leeds" },
  { name: "Pennine Components", domain: "pennine-components.example", industry: "Manufacturing", location: "Sheffield" },
  { name: "Calder Facilities Group", domain: "calder-facilities.example", industry: "Facilities management", location: "Halifax" },
  { name: "Aire Valley Wholesale", domain: "airevalley-wholesale.example", industry: "Wholesale", location: "Bradford" },
  { name: "Ryedale Care Services", domain: "ryedale-care.example", industry: "Healthcare services", location: "York" },
  { name: "Tyne Plant Hire", domain: "tyne-plant-hire.example", industry: "Equipment hire", location: "Newcastle" },
];

export class MockAiProvider implements AiProvider, GroundedSearchProvider {
  readonly name = MOCK_PROVIDER;
  readonly model = MOCK_MODEL;

  async complete<T = unknown>(request: AiRequest): Promise<AiResponse<T>> {
    const startedAt = Date.now();
    const documents = request.data ?? [];
    const context = readContext(request.instruction);
    const signals = detectSignals(
      documents.map((doc) => ({ label: doc.label, url: doc.url, text: doc.content })),
    );
    const companyName = readCompanyName(context);
    const seed = hash(`${request.agent}|${request.instruction}`);

    const input: MockInput = {
      request,
      context,
      documents,
      signals,
      companyName,
      seeded: (salt, min, max) => {
        const value = hash(`${seed}:${salt}`) / 0xffffffff;
        return round2(min + value * (max - min));
      },
    };

    const generator = generators.get(request.agent) ?? BUILT_IN[request.agent];
    const data = generator
      ? generator(input)
      : synthesiseFromSchema(request.responseSchema, input);

    const rawText = JSON.stringify(data, null, 2);
    return {
      data: data as T,
      rawText,
      model: this.model,
      provider: this.name,
      promptTokens: estimateTokens(request.system) + estimateTokens(request.instruction),
      completionTokens: estimateTokens(rawText),
      latencyMs: Date.now() - startedAt,
    };
  }

  /**
   * Offline lead discovery. Returns a fixed set of invented companies on the
   * `.example` TLD, which RFC 2606 reserves precisely so it can never resolve
   * to anything real, and labels every line as sample data. Someone demoing the
   * finder has to be able to see the whole flow; nobody must be able to mistake
   * these for companies worth emailing.
   */
  async searchGrounded(request: GroundedRequest): Promise<GroundedResponse> {
    const startedAt = Date.now();
    const seed = hash(request.instruction);
    const chosen = SAMPLE_PROSPECTS.slice(0, 3 + (seed % (SAMPLE_PROSPECTS.length - 2)));

    const text = [
      "[SAMPLE DATA] Generated locally by the mock AI provider. No search was performed",
      "and none of these companies exist. Set AI_PROVIDER=gemini to search for real ones.",
      "",
      ...chosen.map(
        (company) =>
          `- ${company.name} (${company.domain}) — ${company.industry}, ${company.location}. ` +
          "Sample text: the operations team still consolidates its weekly reporting by hand.",
      ),
    ].join("\n");

    return {
      text,
      citations: chosen.map((company) => ({
        url: `https://${company.domain}/about`,
        title: company.domain,
        domain: company.domain,
      })),
      queries: ["[sample] no search was performed"],
      model: this.model,
      provider: this.name,
      promptTokens: estimateTokens(request.system) + estimateTokens(request.instruction),
      completionTokens: estimateTokens(text),
      latencyMs: Date.now() - startedAt,
    };
  }
}

/* --------------------------------------------------------------- research */

function mockResearch(input: MockInput) {
  const { documents, signals, companyName, seeded } = input;
  const company = record(input.context.company);
  const claims: Array<Record<string, unknown>> = [];
  let counter = 0;
  const nextId = () => `c${++counter}`;

  // 1. What the operator already knows about the company is a fact, sourced to
  //    the CRM record rather than to a web page.
  if (company.industry) {
    claims.push(
      claim(nextId(), "FACT", "profile", `${companyName} operates in ${company.industry}.`, {
        label: "CRM record",
        confidence: 0.9,
      }),
    );
  }
  if (company.employeeCount) {
    claims.push(
      claim(
        nextId(),
        "FACT",
        "size",
        `${companyName} is recorded as having about ${company.employeeCount} employees.`,
        { label: "CRM record", confidence: 0.8 },
      ),
    );
  }

  // 2. One sourced fact per retrieved document, quoting its own words.
  for (const doc of documents.slice(0, 6)) {
    const sentence = firstInformativeSentence(doc.content);
    if (!sentence) continue;
    claims.push(
      claim(nextId(), "FACT", "public-material", sentence, {
        label: doc.label,
        url: doc.url,
        confidence: seeded(`doc:${doc.label}`, 0.7, 0.92),
      }),
    );
  }

  // 3. Every detected signal becomes a sourced fact plus an inference. The
  //    inference is the hypothesis; it is never presented as the fact.
  const byType = new Map<SignalType, DetectedSignal>();
  for (const signal of signals) if (!byType.has(signal.type)) byType.set(signal.type, signal);

  const painClaimIds: string[] = [];
  for (const [type, signal] of [...byType].slice(0, 8)) {
    const factId = nextId();
    claims.push(
      claim(factId, "FACT", "signal", `"${signal.evidence}" — ${signal.sourceLabel}.`, {
        label: signal.sourceLabel,
        url: signal.sourceUrl,
        confidence: seeded(`sig:${type}`, 0.75, 0.95),
      }),
    );
    painClaimIds.push(factId);
    claims.push(
      claim(nextId(), "INFERENCE", "hypothesis", SIGNAL_HYPOTHESES[type].problem, {
        label: signal.sourceLabel,
        url: signal.sourceUrl,
        confidence: seeded(`inf:${type}`, 0.4, 0.7),
      }),
    );
  }

  // 4. Name the gaps explicitly rather than filling them.
  const unknowns = [
    !company.employeeCount ? "Headcount is not stated in the retrieved sources." : null,
    byType.size === 0
      ? "No operational pain signals were found in the retrieved sources."
      : null,
    "Budget, buying process, and current vendor commitments are not visible in public sources.",
    "Which internal systems are in use could not be confirmed from the retrieved pages.",
  ].filter(Boolean) as string[];
  for (const text of unknowns.slice(0, 3)) {
    claims.push(claim(nextId(), "UNKNOWN", "gap", text, { confidence: 0.2 }));
  }

  const familyValues = (family: DetectedSignal["family"]) =>
    unique(
      signals.filter((s) => s.family === family).map((s) => `${s.label}: ${s.evidence}`),
    ).slice(0, 5);

  const suspicious = documents.flatMap((doc) =>
    detectInjection(doc.content).map(
      (finding) =>
        `${doc.label}: ${finding.rule} — "${finding.match}". Treated as data and ignored.`,
    ),
  );

  const sourceCount = documents.length;
  return {
    company_summary: buildSummary(companyName, company, documents, byType.size),
    industry: (company.industry as string) ?? null,
    location: (company.location as string) ?? null,
    size_estimate: company.employeeCount ? `About ${company.employeeCount} employees` : null,
    products_services: extractOffers(documents).slice(0, 5),
    customers: [],
    technology_signals: extractTechnologies(documents),
    recent_news: documents
      .filter((d) => /news|blog|press|announce/i.test(`${d.label} ${d.url ?? ""}`))
      .map((d) => firstInformativeSentence(d.content))
      .filter((s): s is string => Boolean(s))
      .slice(0, 4),
    hiring_signals: familyValues("HIRING"),
    growth_signals: familyValues("GROWTH"),
    operational_signals: familyValues("PAIN"),
    potential_problems: [...byType.keys()].map((t) => SIGNAL_HYPOTHESES[t].problem).slice(0, 6),
    automation_opportunities: [...byType.keys()]
      .map((t) => SIGNAL_HYPOTHESES[t].solution)
      .slice(0, 6),
    decision_makers: readDecisionMakers(input.context),
    pain_signals: [...byType.values()].map((signal) => ({
      type: signal.type,
      evidence: signal.evidence,
      source_url: signal.sourceUrl ?? null,
      source_label: signal.sourceLabel,
    })),
    claims,
    suspicious_content: unique(suspicious).slice(0, 10),
    research_confidence: round2(
      Math.min(0.9, 0.25 + sourceCount * 0.08 + Math.min(byType.size, 5) * 0.06),
    ),
  };
}

function buildSummary(
  companyName: string,
  company: Record<string, unknown>,
  documents: UntrustedDocument[],
  signalCount: number,
) {
  const parts: string[] = [];
  const industry = company.industry ? ` in ${company.industry}` : "";
  const location = company.location ? `, based in ${company.location}` : "";
  parts.push(`${companyName} is a company${industry}${location}.`);
  if (company.description) parts.push(String(company.description));
  const lead = documents.map((d) => firstInformativeSentence(d.content)).find(Boolean);
  if (lead) parts.push(lead);
  parts.push(
    signalCount > 0
      ? `${signalCount} operational signal${signalCount === 1 ? "" : "s"} were found across ${documents.length} source${documents.length === 1 ? "" : "s"}; each is recorded with the sentence it came from.`
      : `No operational pain signals were found across ${documents.length} retrieved source${documents.length === 1 ? "" : "s"}.`,
  );
  parts.push("Analysis produced by the built-in mock model; no external AI was called.");
  return parts.join(" ");
}

/* ---------------------------------------------------------- qualification */

function mockQualification(input: MockInput) {
  const { signals, companyName, seeded, context } = input;
  const company = record(context.company);
  const icp = record(context.ideal_customer_profile);
  const claims = list(context.research_claims);

  const matched: Array<{ criterion: string; evidence: string; claim_id: string | null }> = [];
  const missing: string[] = [];

  const industries = strings(icp.industries);
  if (company.industry && industries.length) {
    const hit = industries.some((i) =>
      String(company.industry).toLowerCase().includes(i.toLowerCase()),
    );
    if (hit) {
      matched.push({
        criterion: "Industry",
        evidence: `Recorded industry "${company.industry}" is in the ICP list.`,
        claim_id: firstClaimId(claims),
      });
    } else {
      missing.push(`Industry "${company.industry}" is not in the ICP list.`);
    }
  } else if (industries.length) {
    missing.push("Industry is not recorded for this company.");
  }

  const size = Number(company.employeeCount ?? 0);
  const min = Number(icp.minEmployees ?? 0);
  const max = Number(icp.maxEmployees ?? 0);
  if (size > 0 && (min || max)) {
    const inRange = (!min || size >= min) && (!max || size <= max);
    if (inRange) {
      matched.push({
        criterion: "Company size",
        evidence: `About ${size} employees, inside the ICP band.`,
        claim_id: null,
      });
    } else {
      missing.push(`Headcount ${size} sits outside the ICP band ${min || 0}-${max || "any"}.`);
    }
  } else if (min || max) {
    missing.push("Headcount is unknown, so size fit could not be evaluated.");
  }

  const painTypes = distinctTypes(signals.filter((s) => s.family === "PAIN"));
  for (const type of painTypes.slice(0, 4)) {
    const signal = signals.find((s) => s.type === type)!;
    matched.push({
      criterion: `Operational problem: ${signal.label}`,
      evidence: signal.evidence,
      claim_id: null,
    });
  }
  if (painTypes.length === 0) {
    missing.push("No operational problem was evidenced in the retrieved sources.");
  }

  const score = matched.length - missing.length * 0.5;
  const verdict =
    score >= 4
      ? "STRONG_FIT"
      : score >= 2
        ? "POSSIBLE_FIT"
        : score >= 0
          ? "WEAK_FIT"
          : "NOT_A_FIT";

  return {
    verdict,
    rationale: [
      `${companyName} matches ${matched.length} of the criteria that could be evaluated`,
      missing.length ? `and ${missing.length} could not be confirmed.` : "with no gaps found.",
      painTypes.length
        ? `The strongest evidence is the ${signals.find((s) => s.type === painTypes[0])!.label.toLowerCase()} signal.`
        : "There is no evidence yet of a solvable operational problem.",
    ].join(" "),
    matched_criteria: matched,
    missing_criteria: missing,
    disqualifiers: [],
    open_questions: [
      "Who owns the process today, and is it painful enough to fund?",
      "Is there an internal team already trying to solve this?",
    ],
    recommended_stage:
      verdict === "STRONG_FIT"
        ? "READY_FOR_OUTREACH"
        : verdict === "POSSIBLE_FIT"
          ? "QUALIFIED"
          : verdict === "WEAK_FIT"
            ? "COLD"
            : "NOT_A_FIT",
    qualification_confidence: seeded("qualification", 0.45, 0.8),
  };
}

/* ----------------------------------------------------------- opportunity */

function mockOpportunity(input: MockInput) {
  const { companyName, seeded, context } = input;
  const claims = list(context.research_claims);
  const contextSignals = list(context.detected_signals);

  // An operational problem makes a better opportunity than "they are growing",
  // so pain signals are offered first.
  const familyRank: Record<string, number> = { PAIN: 0, HIRING: 1, TRIGGER: 2, GROWTH: 3 };
  const types = unique(
    contextSignals
      .map((s) => String(record(s).type ?? ""))
      .filter((t): t is SignalType => t in SIGNAL_HYPOTHESES),
  ).sort((a, b) => (familyRank[familyOf(a)] ?? 9) - (familyRank[familyOf(b)] ?? 9));

  const opportunities = types.slice(0, 3).map((type, index) => {
    const hypothesis = SIGNAL_HYPOTHESES[type];
    const evidenceSignals = contextSignals
      .map(record)
      .filter((s) => s.type === type)
      .slice(0, 3);
    const supporting = evidenceSignals.map((signal) => ({
      claim_id: matchClaimId(claims, String(signal.evidence ?? "")),
      source_url: (signal.sourceUrl as string) ?? null,
      note: String(signal.evidence ?? "").slice(0, 240),
    }));
    return {
      title: `${titleFor(type)} at ${companyName}`,
      problem: hypothesis.problem,
      possible_solution: hypothesis.solution,
      potential_benefit: hypothesis.benefit,
      opportunity_confidence: seeded(`opp:${type}:${index}`, 0.4, 0.78),
      supporting_evidence: supporting.length
        ? supporting
        : [{ claim_id: firstClaimId(claims), source_url: null, note: "Derived from the research report." }],
      estimated_value_min: null,
      estimated_value_max: null,
    };
  });

  return {
    opportunities,
    summary: opportunities.length
      ? `${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} derived from evidence found in the retrieved sources for ${companyName}.`
      : `No opportunity could be evidenced for ${companyName} from the retrieved sources.`,
  };
}

function familyOf(type: SignalType) {
  return SIGNAL_RULES.find((rule) => rule.type === type)?.family ?? "PAIN";
}

function titleFor(type: SignalType) {
  const words = type.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* ------------------------------------------------------------- discovery */

function mockDiscovery(input: MockInput) {
  const { companyName, context } = input;
  const claims = list(context.research_claims).map(record);
  const opportunities = list(context.opportunities).map(record);
  const contact = record(context.contact);

  const facts = claims.filter((c) => c.type === "FACT").map((c) => String(c.text));
  const inferences = claims.filter((c) => c.type === "INFERENCE").map((c) => String(c.text));

  const questions = [
    ["CURRENT_PROCESS", "How is this handled today, end to end?", "Establishes the real process before proposing anything."],
    ["CURRENT_PROCESS", "Which systems does the information pass through?", "Reveals the integration points."],
    ["TIME_COST", "Roughly how many hours a week go into it?", "Converts the problem into a number."],
    ["TIME_COST", "How many people touch the workflow?", "Sizes the impact beyond one role."],
    ["PROBLEMS", "Where do errors usually creep in?", "Errors are often more expensive than time."],
    ["PROBLEMS", "Which part causes the most frustration?", "Frustration indicates where change is welcome."],
    ["BUSINESS_IMPACT", "What happens downstream when it is late?", "Links the process to money or customers."],
    ["EXISTING_ATTEMPTS", "Has anyone tried to automate this before?", "Avoids repeating a failed approach."],
    ["PURCHASE_PROCESS", "Who else would need to look at a project like this?", "Finds the other decision makers early."],
    ["PURCHASE_PROCESS", "Is there budget already assigned to this area?", "Tests whether this is fundable this year."],
  ] as const;

  return {
    brief: {
      company_summary: `${companyName}${context.company && record(context.company).industry ? ` — ${record(context.company).industry}` : ""}. ${facts[0] ?? "No public facts were retrieved."}`,
      contact_summary: contact.firstName
        ? `${contact.firstName} ${contact.lastName ?? ""}${contact.title ? `, ${contact.title}` : ""}`.trim()
        : "No named contact recorded yet.",
      known_problems: facts.slice(0, 4),
      likely_problems: inferences.slice(0, 4),
      research_evidence: claims.slice(0, 6).map((c) => ({
        claim_id: (c.id as string) ?? null,
        text: String(c.text),
      })),
      potential_opportunities: opportunities.map((o) => String(o.title ?? o.problem ?? "")).slice(0, 4),
      possible_objections: [
        "We already have someone looking at this internally.",
        "We are mid-way through another system change.",
        "This is not a priority until next budget year.",
      ],
      goals_for_call: [
        "Confirm the process as it actually runs today.",
        "Get one number: hours per week or cost per cycle.",
        "Identify who else must agree before anything happens.",
      ],
    },
    questions: questions.map(([category, question, rationale]) => ({
      category,
      question,
      rationale,
    })),
  };
}

/* ------------------------------------------------------------ sales coach */

function mockSalesCoach(input: MockInput) {
  const { context } = input;
  const goals = list(context.goals).map(record);
  const dueTasks = list(context.dueTasks).map(record);
  const waiting = list(context.waitingReplies).map(record);
  const fresh = list(context.freshResearch).map(record);
  const meetings = list(context.meetings).map(record);

  const priorities: Array<{ rank: number; action: string; reason: string; lead_id: string | null }> = [];
  const push = (action: string, reason: string, leadId: string | null) => {
    if (priorities.length >= 5) return;
    priorities.push({ rank: priorities.length + 1, action, reason, lead_id: leadId });
  };

  for (const meeting of meetings.slice(0, 1)) {
    push(
      `Prepare for "${meeting.title}" at ${String(meeting.scheduledAt).slice(11, 16) || "today"}`,
      "A booked call is the highest-value hour in the day.",
      (meeting.leadId as string) ?? null,
    );
  }
  const stale = waiting.filter((w) => Number(w.daysSinceContact) >= 4).slice(0, 2);
  for (const lead of stale) {
    push(
      `Follow up with ${lead.company}`,
      `No reply for ${lead.daysSinceContact} days.`,
      (lead.leadId as string) ?? null,
    );
  }
  if (fresh.length) {
    push(
      `Review ${fresh.length} researched lead${fresh.length === 1 ? "" : "s"}`,
      "Research goes stale, and unreviewed reports never become outreach.",
      null,
    );
  }
  if (dueTasks.length) {
    push(
      `Clear ${dueTasks.length} due task${dueTasks.length === 1 ? "" : "s"}`,
      `Starting with "${dueTasks[0].title}".`,
      (dueTasks[0].leadId as string) ?? null,
    );
  }
  if (priorities.length === 0) {
    push(
      "Add leads to the pipeline",
      "Nothing is due and nothing is waiting — the constraint today is top of funnel.",
      null,
    );
  }

  const funnel = record(context.funnel);
  return {
    headline: `Today's plan: ${priorities.length} priorit${priorities.length === 1 ? "y" : "ies"}.`,
    priorities,
    pipeline_observation: funnel.repliesRate
      ? `Reply rate is ${funnel.repliesRate}% and ${funnel.discoveryRate}% of replies reach a discovery call. The gap is between reply and call, not between send and reply.`
      : "Not enough sent volume yet to read the funnel; the first meaningful number will be reply rate.",
    goal_status: goals.map((goal) => ({
      metric: String(goal.metric),
      current: Number(goal.current ?? 0),
      target: Number(goal.target ?? 0),
      comment:
        Number(goal.current ?? 0) >= Number(goal.target ?? 0)
          ? "Met."
          : `${Number(goal.target ?? 0) - Number(goal.current ?? 0)} to go this ${String(goal.period ?? "period").toLowerCase()}.`,
    })),
    risks: stale.length
      ? [`${stale.length} conversation${stale.length === 1 ? "" : "s"} are going cold.`]
      : [],
  };
}

const BUILT_IN: Partial<Record<AgentName, MockGenerator>> = {
  research: mockResearch,
  searchplan: mockSearchPlan,
  qualification: mockQualification,
  opportunity: mockOpportunity,
  discovery: mockDiscovery,
  salesCoach: mockSalesCoach,
};

/** The searches a person would type; keeps mock runs' activity logs readable. */
function mockSearchPlan(input: MockInput) {
  const company = record(input.context.company);
  const domain = (company.domain as string | undefined) ?? "";
  return {
    queries: [
      {
        query: `${input.companyName} leadership team`,
        goal: "people",
        reason: "The team or leadership page names decision makers.",
      },
      {
        query: `${input.companyName} ${domain} contact email`,
        goal: "people",
        reason: "Contact pages and directories list addresses and phone numbers.",
      },
      {
        query: `${input.companyName} news`,
        goal: "company",
        reason: "Recent coverage surfaces growth and operational pain.",
      },
    ],
  };
}

/* ------------------------------------------------- schema-driven fallback */

/**
 * Produces a schema-valid object for any agent without a hand-written
 * generator, so a new agent works against the mock provider on the day it is
 * written. Strings mention the real company name so drafts read plausibly.
 */
export function synthesiseFromSchema(
  schema: Record<string, unknown>,
  input: MockInput,
  path = "root",
  depth = 0,
): unknown {
  if (depth > 8) return null;

  const anyOf = (schema.anyOf ?? schema.oneOf) as Record<string, unknown>[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length) {
    const concrete = anyOf.find((branch) => branch.type !== "null") ?? anyOf[0];
    return synthesiseFromSchema(concrete, input, path, depth + 1);
  }

  const enumValues = schema.enum as unknown[] | undefined;
  if (Array.isArray(enumValues) && enumValues.length) return enumValues[0];

  switch (schema.type) {
    case "object": {
      const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        out[key] = synthesiseFromSchema(value, input, key, depth + 1);
      }
      return out;
    }
    case "array": {
      const items = schema.items as Record<string, unknown> | undefined;
      if (!items) return [];
      return [synthesiseFromSchema(items, input, path, depth + 1)];
    }
    case "number":
      return /confidence|score|rate|probability/i.test(path)
        ? input.seeded(path, 0.4, 0.8)
        : 0;
    case "integer":
      return /rank|order|step|day/i.test(path) ? 1 : 0;
    case "boolean":
      return false;
    case "null":
      return null;
    default:
      return fallbackString(path, input);
  }
}

function fallbackString(path: string, input: MockInput) {
  const company = input.companyName;
  const evidence = input.signals[0]?.evidence;
  if (/subject/i.test(path)) return `Question about your reporting process, ${company}`;
  if (/body|message|content|draft/i.test(path)) {
    return [
      `Hello,`,
      "",
      evidence
        ? `I came across this on your site: "${truncate(evidence, 160)}"`
        : `I have been reading about ${company} and how your team handles its reporting.`,
      "",
      "I build small systems that take that kind of recurring work off people's desks.",
      "Would a short call be useful?",
      "",
      "(Draft written by the built-in mock model.)",
    ].join("\n");
  }
  if (/reason|rationale|why|explanation|note|comment/i.test(path)) {
    return evidence
      ? `Based on evidence found in the retrieved sources: "${truncate(evidence, 160)}"`
      : "Derived from the structured context supplied with the request.";
  }
  if (/summary|observation|headline|title|problem|solution|benefit/i.test(path)) {
    return `${company}: ${path.replace(/_/g, " ")} generated by the built-in mock model.`;
  }
  if (/url|link/i.test(path)) return "";
  if (/date|at$/i.test(path)) return new Date(0).toISOString();
  return `${path.replace(/_/g, " ")} (mock)`;
}

/* ------------------------------------------------------------- utilities */

function claim(
  id: string,
  type: "FACT" | "INFERENCE" | "UNKNOWN",
  category: string,
  text: string,
  source: { label?: string; url?: string; confidence?: number } = {},
) {
  return {
    id,
    type,
    category,
    text,
    source_url: source.url ?? null,
    source_label: source.label ?? null,
    confidence: source.confidence ?? 0.5,
  };
}

function readCompanyName(context: Record<string, unknown>) {
  const company = record(context.company);
  const name = company.name ?? context.company_name ?? context.companyName;
  return typeof name === "string" && name.trim() ? name.trim() : "this company";
}

function readDecisionMakers(context: Record<string, unknown>) {
  const contact = record(context.contact);
  if (!contact.firstName) return [];
  return [
    {
      name: `${contact.firstName} ${contact.lastName ?? ""}`.trim(),
      title: (contact.title as string) ?? null,
      role: "UNKNOWN" as const,
      email: (contact.email as string | undefined) ?? null,
      source_url: null,
    },
  ];
}

const TECHNOLOGIES = [
  "Excel",
  "Google Sheets",
  "Xero",
  "QuickBooks",
  "Sage",
  "SAP",
  "NetSuite",
  "Salesforce",
  "HubSpot",
  "Dynamics",
  "WordPress",
  "Shopify",
  "Zapier",
  "Power BI",
  "Tableau",
  "SharePoint",
  "Access",
];

function extractTechnologies(documents: UntrustedDocument[]) {
  const found = new Set<string>();
  for (const doc of documents) {
    for (const tech of TECHNOLOGIES) {
      if (new RegExp(`\\b${tech.replace(/\s/g, "\\s")}\\b`, "i").test(doc.content)) {
        found.add(tech);
      }
    }
  }
  return [...found].slice(0, 8);
}

function extractOffers(documents: UntrustedDocument[]) {
  const offers: string[] = [];
  for (const doc of documents) {
    if (!/service|product|solution|what we do|offer/i.test(`${doc.label} ${doc.content}`)) continue;
    for (const line of doc.content.split("\n")) {
      const trimmed = line.trim().replace(/^[-*•]\s*/, "");
      if (trimmed.length >= 8 && trimmed.length <= 90 && !/\.$/.test(trimmed)) {
        offers.push(trimmed);
      }
      if (offers.length >= 8) break;
    }
  }
  return unique(offers);
}

function firstInformativeSentence(text: string): string | null {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    // Skip bracketed banners (the mock search provider's sample-data notice,
    // cookie prompts) — they are about the page, not about the company.
    .filter(
      (s) => s.length >= 40 && s.length <= 300 && /[a-z]/.test(s) && !s.startsWith("["),
    );
  return sentences[0] ?? null;
}

function matchClaimId(claims: unknown[], evidence: string): string | null {
  const needle = evidence.toLowerCase().slice(0, 60);
  if (!needle) return null;
  for (const raw of claims) {
    const item = record(raw);
    if (typeof item.text === "string" && item.text.toLowerCase().includes(needle)) {
      return (item.id as string) ?? null;
    }
  }
  return null;
}

function firstClaimId(claims: unknown[]): string | null {
  const first = record(claims[0]);
  return (first.id as string) ?? null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === "string");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** FNV-1a: small, dependency-free, and stable across runs. */
function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function estimateTokens(text: string) {
  return Math.ceil((text?.length ?? 0) / 4);
}
