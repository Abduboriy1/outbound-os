/**
 * Lead scoring (plan §12).
 *
 * Two 0-100 scores and an overall. Deliberately deterministic and pure: the
 * number has to be defensible in front of a prospect, so it is computed from
 * recorded evidence rather than asked of a model. Every factor returns its own
 * rationale, which is what the UI shows when someone asks "why 87?".
 *
 * Missing evidence scores as `UNKNOWN_RATIO` rather than zero. A company we
 * know nothing about is not a bad fit; it is an unresearched one, and zeroing
 * it would bury leads that simply have not been looked at yet.
 */

import type { DetectedSignal, SignalType } from "~~/server/lib/research/signals";
import {
  DEFAULT_WEIGHTS,
  FIT_FACTORS,
  FIT_FACTOR_LABELS,
  OPPORTUNITY_FACTORS,
  OPPORTUNITY_FACTOR_LABELS,
  type FitFactorKey,
  type OpportunityFactorKey,
  type ScoringWeights,
} from "~~/shared/scoring/weights";

export const UNKNOWN_RATIO = 0.35;
/** Used when the ICP places no constraint on a factor — neither credit nor penalty. */
export const UNCONSTRAINED_RATIO = 0.6;

export type FactorResult<K extends string = string> = {
  key: K;
  label: string;
  weight: number;
  /** 0-1 share of the factor's weight that was earned. */
  ratio: number;
  points: number;
  max: number;
  rationale: string;
  known: boolean;
};

export type ScoreBreakdown<K extends string = string> = {
  score: number;
  factors: FactorResult<K>[];
};

export type IcpInput = {
  name?: string;
  industries?: string[];
  geographies?: string[];
  targetRoles?: string[];
  problems?: string[];
  minEmployees?: number | null;
  maxEmployees?: number | null;
  minDealSize?: number | null;
  maxDealSize?: number | null;
};

export type ScoreInput = {
  icp?: IcpInput | null;
  company: {
    name: string;
    industry?: string | null;
    location?: string | null;
    employeeCount?: number | null;
    description?: string | null;
  };
  /** Contacts already found for the company. */
  contacts?: { title?: string | null; decisionRole?: string | null }[];
  /** Technologies named in the research report. */
  technologySignals?: string[];
  signals?: DetectedSignal[];
  /** Set when the operator or the research has an expected deal size. */
  expectedValue?: number | null;
  /** 0-1, supplied when something time-bound is known (a deadline, a tender). */
  urgency?: number | null;
};

const MANUAL_WORKFLOW_TYPES: SignalType[] = [
  "MANUAL_PROCESS",
  "SPREADSHEET",
  "DATA_ENTRY",
  "DUPLICATE_ENTRY",
  "RECONCILIATION",
  "CSV_EXPORT",
];

/** Legacy or spreadsheet-shaped stacks are a positive fit signal for automation work. */
const AUTOMATABLE_TECH = /excel|sheets|access|sage|quickbooks|xero|sharepoint|csv|vba|legacy/i;

export function scoreFit(
  input: ScoreInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoreBreakdown<FitFactorKey> {
  const icp = input.icp ?? null;
  const company = input.company;
  const contacts = input.contacts ?? [];

  const results: Record<FitFactorKey, Omit<FactorResult<FitFactorKey>, "key" | "label" | "weight" | "points" | "max">> = {
    industry: evaluateIndustry(icp, company.industry),
    size: evaluateSize(icp, company.employeeCount),
    geography: evaluateGeography(icp, company.location),
    technology: evaluateTechnology(input.technologySignals ?? []),
    roleAvailability: evaluateRoles(icp, contacts),
    expectedBudget: evaluateBudget(icp, company.employeeCount, input.expectedValue ?? null),
    businessModel: evaluateBusinessModel(company.description ?? null, icp),
  };

  return assemble(FIT_FACTORS, FIT_FACTOR_LABELS, weights.fit, results);
}

export function scoreOpportunity(
  input: ScoreInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoreBreakdown<OpportunityFactorKey> {
  const signals = input.signals ?? [];
  const types = new Set(signals.map((s) => s.type));
  const painTypes = signals.filter((s) => s.family === "PAIN").map((s) => s.type);
  const distinctPain = new Set(painTypes).size;
  const hiring = signals.filter((s) => s.family === "HIRING").length;
  const growth = signals.filter((s) => s.family === "GROWTH").length;
  const triggers = signals.filter((s) => s.family === "TRIGGER");
  const manual = MANUAL_WORKFLOW_TYPES.filter((t) => types.has(t)).length;
  const contacts = input.contacts ?? [];
  const decisionMakers = contacts.filter(
    (c) => c.decisionRole === "DECISION_MAKER" || c.decisionRole === "CHAMPION",
  ).length;

  const researched = signals.length > 0;

  const results: Record<
    OpportunityFactorKey,
    Omit<FactorResult<OpportunityFactorKey>, "key" | "label" | "weight" | "points" | "max">
  > = {
    painSignals: {
      ratio: researched ? clamp(distinctPain / 4) : UNKNOWN_RATIO,
      known: researched,
      rationale: researched
        ? `${distinctPain} distinct pain signal${distinctPain === 1 ? "" : "s"} evidenced in the sources.`
        : "No research has been run yet.",
    },
    hiring: {
      ratio: researched ? clamp(hiring / 2) : UNKNOWN_RATIO,
      known: researched,
      rationale: researched
        ? hiring
          ? `${hiring} hiring signal${hiring === 1 ? "" : "s"} found.`
          : "No hiring activity found in the sources."
        : "No research has been run yet.",
    },
    manualWorkflows: {
      ratio: researched ? clamp(manual / 3) : UNKNOWN_RATIO,
      known: researched,
      rationale: researched
        ? manual
          ? `${manual} manual-workflow signal type${manual === 1 ? "" : "s"} (spreadsheets, re-keying, reconciliation).`
          : "No manual workflow described in the sources."
        : "No research has been run yet.",
    },
    growth: {
      ratio: researched ? clamp(growth / 2) : UNKNOWN_RATIO,
      known: researched,
      rationale: researched
        ? growth
          ? `${growth} growth signal${growth === 1 ? "" : "s"} found.`
          : "No growth signal found in the sources."
        : "No research has been run yet.",
    },
    urgency: evaluateUrgency(input.urgency ?? null, triggers.length, hiring),
    decisionMaker: {
      ratio: decisionMakers > 0 ? 1 : contacts.length > 0 ? 0.5 : 0,
      known: contacts.length > 0,
      rationale: decisionMakers
        ? `${decisionMakers} decision maker${decisionMakers === 1 ? "" : "s"} identified.`
        : contacts.length
          ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"} known, but none confirmed as the decision maker.`
          : "No contact identified yet.",
    },
    triggerEvent: {
      ratio: researched ? clamp(triggers.length) : UNKNOWN_RATIO,
      known: researched,
      rationale: triggers.length
        ? `Trigger event: ${triggers[0].label.toLowerCase()}.`
        : researched
          ? "No recent trigger event found."
          : "No research has been run yet.",
    },
  };

  return assemble(OPPORTUNITY_FACTORS, OPPORTUNITY_FACTOR_LABELS, weights.opportunity, results);
}

export type LeadScoreResult = {
  fitScore: number;
  opportunityScore: number;
  overallScore: number;
  fit: ScoreBreakdown<FitFactorKey>;
  opportunity: ScoreBreakdown<OpportunityFactorKey>;
  rationale: string;
};

export function scoreLead(
  input: ScoreInput,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): LeadScoreResult {
  const fit = scoreFit(input, weights);
  const opportunity = scoreOpportunity(input, weights);
  const overallScore = Math.round(
    fit.score * weights.blend.fit + opportunity.score * weights.blend.opportunity,
  );

  return {
    fitScore: fit.score,
    opportunityScore: opportunity.score,
    overallScore,
    fit,
    opportunity,
    rationale: buildRationale(input, fit, opportunity, overallScore),
  };
}

function buildRationale(
  input: ScoreInput,
  fit: ScoreBreakdown<FitFactorKey>,
  opportunity: ScoreBreakdown<OpportunityFactorKey>,
  overall: number,
) {
  const strongest = [...fit.factors, ...opportunity.factors]
    .filter((f) => f.known)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2);
  const weakest = [...fit.factors, ...opportunity.factors]
    .filter((f) => f.known && f.ratio < 0.4)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, 1);
  const unknowns = [...fit.factors, ...opportunity.factors].filter((f) => !f.known);

  const parts = [
    `Overall ${overall} (fit ${fit.score}, opportunity ${opportunity.score}) for ${input.company.name}.`,
  ];
  if (strongest.length) {
    parts.push(`Strongest: ${strongest.map((f) => f.label.toLowerCase()).join(" and ")}.`);
  }
  if (weakest.length) parts.push(`Weakest: ${weakest[0].label.toLowerCase()}.`);
  if (unknowns.length) {
    parts.push(
      `${unknowns.length} factor${unknowns.length === 1 ? "" : "s"} could not be evaluated: ${unknowns
        .map((f) => f.label.toLowerCase())
        .join(", ")}.`,
    );
  }
  return parts.join(" ");
}

/* ---------------------------------------------------------------- factors */

function evaluateIndustry(icp: IcpInput | null, industry?: string | null) {
  const list = icp?.industries ?? [];
  if (!list.length) {
    return {
      ratio: UNCONSTRAINED_RATIO,
      known: true,
      rationale: "The ICP does not restrict industry.",
    };
  }
  if (!industry) {
    return { ratio: UNKNOWN_RATIO, known: false, rationale: "Industry is not recorded." };
  }
  const hit = list.find((value) => looseMatch(industry, value));
  return hit
    ? { ratio: 1, known: true, rationale: `"${industry}" matches the ICP industry "${hit}".` }
    : {
        ratio: 0.1,
        known: true,
        rationale: `"${industry}" is not one of the ICP industries (${list.join(", ")}).`,
      };
}

function evaluateSize(icp: IcpInput | null, employees?: number | null) {
  const min = icp?.minEmployees ?? null;
  const max = icp?.maxEmployees ?? null;
  if (min === null && max === null) {
    return {
      ratio: UNCONSTRAINED_RATIO,
      known: true,
      rationale: "The ICP does not restrict company size.",
    };
  }
  if (!employees) {
    return { ratio: UNKNOWN_RATIO, known: false, rationale: "Headcount is not recorded." };
  }
  const aboveMin = min === null || employees >= min;
  const belowMax = max === null || employees <= max;
  if (aboveMin && belowMax) {
    return {
      ratio: 1,
      known: true,
      rationale: `${employees} employees, inside the target band ${min ?? "any"}-${max ?? "any"}.`,
    };
  }
  // Just outside the band is still worth a look; far outside is not.
  const distance = !aboveMin ? (min! - employees) / Math.max(min!, 1) : (employees - max!) / Math.max(max!, 1);
  const ratio = distance <= 0.25 ? 0.6 : distance <= 1 ? 0.3 : 0.05;
  return {
    ratio,
    known: true,
    rationale: `${employees} employees, outside the target band ${min ?? "any"}-${max ?? "any"}.`,
  };
}

function evaluateGeography(icp: IcpInput | null, location?: string | null) {
  const list = icp?.geographies ?? [];
  if (!list.length) {
    return {
      ratio: UNCONSTRAINED_RATIO,
      known: true,
      rationale: "The ICP does not restrict geography.",
    };
  }
  if (!location) {
    return { ratio: UNKNOWN_RATIO, known: false, rationale: "Location is not recorded." };
  }
  const hit = list.find((value) => looseMatch(location, value));
  return hit
    ? { ratio: 1, known: true, rationale: `"${location}" is within the target geography "${hit}".` }
    : { ratio: 0.15, known: true, rationale: `"${location}" is outside the target geographies.` };
}

function evaluateTechnology(technologies: string[]) {
  if (!technologies.length) {
    return {
      ratio: UNKNOWN_RATIO,
      known: false,
      rationale: "No technology signals were found in the sources.",
    };
  }
  const automatable = technologies.filter((tech) => AUTOMATABLE_TECH.test(tech));
  const ratio = clamp(0.4 + automatable.length * 0.3 + technologies.length * 0.05);
  return {
    ratio,
    known: true,
    rationale: automatable.length
      ? `Stack includes ${automatable.join(", ")}, which is the kind of work this offer replaces.`
      : `Technology named in the sources: ${technologies.slice(0, 4).join(", ")}.`,
  };
}

function evaluateRoles(
  icp: IcpInput | null,
  contacts: { title?: string | null; decisionRole?: string | null }[],
) {
  if (!contacts.length) {
    return { ratio: 0, known: true, rationale: "No contact has been identified yet." };
  }
  const targets = icp?.targetRoles ?? [];
  if (!targets.length) {
    return {
      ratio: UNCONSTRAINED_RATIO,
      known: true,
      rationale: `${contacts.length} contact${contacts.length === 1 ? "" : "s"} known; the ICP does not name target roles.`,
    };
  }
  const match = contacts.find((contact) =>
    targets.some((role) => contact.title && looseMatch(contact.title, role)),
  );
  return match
    ? { ratio: 1, known: true, rationale: `Contact "${match.title}" matches a target role.` }
    : {
        ratio: 0.4,
        known: true,
        rationale: `Contacts exist but none holds a target role (${targets.join(", ")}).`,
      };
}

function evaluateBudget(
  icp: IcpInput | null,
  employees: number | null | undefined,
  expectedValue: number | null,
) {
  const min = icp?.minDealSize ?? null;
  const max = icp?.maxDealSize ?? null;

  if (expectedValue !== null) {
    if (min === null && max === null) {
      return {
        ratio: UNCONSTRAINED_RATIO,
        known: true,
        rationale: `Expected value ${expectedValue}; the ICP sets no deal size band.`,
      };
    }
    const inBand = (min === null || expectedValue >= min) && (max === null || expectedValue <= max);
    return {
      ratio: inBand ? 1 : 0.3,
      known: true,
      rationale: inBand
        ? `Expected value ${expectedValue} is inside the target deal band.`
        : `Expected value ${expectedValue} is outside the target deal band.`,
    };
  }

  if (!employees) {
    return {
      ratio: UNKNOWN_RATIO,
      known: false,
      rationale: "No expected value, and headcount is unknown, so budget cannot be estimated.",
    };
  }
  // Headcount as a rough proxy: it is the only budget evidence public sources
  // reliably give, and it is recorded as an inference, not a fact.
  const ratio = employees >= 50 ? 1 : employees >= 20 ? 0.7 : employees >= 10 ? 0.5 : 0.3;
  return {
    ratio,
    known: true,
    rationale: `Budget inferred from headcount (${employees}); no stated figure.`,
  };
}

function evaluateBusinessModel(description: string | null, icp: IcpInput | null) {
  if (!description) {
    return {
      ratio: UNKNOWN_RATIO,
      known: false,
      rationale: "No description recorded, so the business model is unknown.",
    };
  }
  const b2b = /\b(b2b|wholesale|supplier|distributor|contract|clients?|commercial|trade)\b/i.test(
    description,
  );
  const b2c = /\b(b2c|consumer|retail store|shoppers)\b/i.test(description);
  const problems = icp?.problems ?? [];
  const problemHit = problems.find((problem) => looseMatch(description, problem));

  if (problemHit) {
    return {
      ratio: 1,
      known: true,
      rationale: `Description mentions an ICP problem area ("${problemHit}").`,
    };
  }
  if (b2b && !b2c) {
    return { ratio: 0.85, known: true, rationale: "Description reads as a B2B operation." };
  }
  if (b2c && !b2b) {
    return {
      ratio: 0.35,
      known: true,
      rationale: "Description reads as consumer-facing, which fits this offer less well.",
    };
  }
  return {
    ratio: UNCONSTRAINED_RATIO,
    known: true,
    rationale: "Business model is not clear from the description.",
  };
}

function evaluateUrgency(urgency: number | null, triggers: number, hiring: number) {
  if (urgency !== null) {
    return {
      ratio: clamp(urgency),
      known: true,
      rationale: `Urgency supplied by the operator (${Math.round(clamp(urgency) * 100)}%).`,
    };
  }
  if (triggers === 0 && hiring === 0) {
    return {
      ratio: UNKNOWN_RATIO,
      known: false,
      rationale: "Nothing time-bound found, so urgency is unknown.",
    };
  }
  return {
    ratio: clamp((triggers * 0.6 + hiring * 0.4) / 1.5),
    known: true,
    rationale: `Urgency inferred from ${triggers} trigger event${triggers === 1 ? "" : "s"} and ${hiring} hiring signal${hiring === 1 ? "" : "s"}.`,
  };
}

/* -------------------------------------------------------------- assembly */

function assemble<K extends string>(
  keys: readonly K[],
  labels: Record<K, string>,
  weights: Record<K, number>,
  results: Record<K, { ratio: number; known: boolean; rationale: string }>,
): ScoreBreakdown<K> {
  const factors: FactorResult<K>[] = keys.map((key) => {
    const weight = weights[key] ?? 0;
    const ratio = clamp(results[key].ratio);
    return {
      key,
      label: labels[key],
      weight,
      ratio,
      points: round1(ratio * weight),
      max: weight,
      rationale: results[key].rationale,
      known: results[key].known,
    };
  });

  const totalWeight = factors.reduce((total, factor) => total + factor.weight, 0);
  const earned = factors.reduce((total, factor) => total + factor.points, 0);
  const score = totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 0;

  return { score: Math.max(0, Math.min(100, score)), factors };
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

/** Substring match in either direction, so "Logistics" matches "Freight & Logistics". */
function looseMatch(a: string, b: string) {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}
