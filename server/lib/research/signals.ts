/**
 * Pain signal detection (plan §10).
 *
 * The point of this layer is that a signal is only worth acting on if we can
 * show the sentence it came from and the page it was on. Every signal therefore
 * carries its evidence snippet and its source, whether it was found by these
 * rules or proposed by the AI.
 *
 * Pure module: no database, no network, no AI. Fully unit-tested.
 */

export type SignalType =
  | "MANUAL_PROCESS"
  | "SPREADSHEET"
  | "RECONCILIATION"
  | "DATA_ENTRY"
  | "DUPLICATE_ENTRY"
  | "CSV_EXPORT"
  | "REPORTING"
  | "COMPLIANCE"
  | "ADMIN_PROCESSING"
  | "MULTIPLE_PLATFORMS"
  | "LEGACY_SOFTWARE"
  | "FRAGMENTED_WORKFLOW"
  | "HIRING"
  | "GROWTH"
  | "ACQUISITION"
  | "EXPANSION";

/** Which score factor a signal feeds (plan §12). */
export type SignalFamily = "PAIN" | "HIRING" | "GROWTH" | "TRIGGER";

export type SignalOrigin = "RULE" | "AI";

/** A piece of retrieved text a signal can be found in. */
export type SignalSource = {
  /** ResearchSource id once persisted; absent while the text is in flight. */
  id?: string;
  label: string;
  url?: string;
  kind?: string;
  text: string;
};

export type DetectedSignal = {
  type: SignalType;
  label: string;
  family: SignalFamily;
  /** The phrase that matched, or the AI's own term. */
  keyword: string;
  /** The sentence the phrase appeared in — shown verbatim in the UI. */
  evidence: string;
  sourceId?: string;
  sourceLabel: string;
  sourceUrl?: string;
  /** 0-1 strength used by the opportunity score. */
  weight: number;
  origin: SignalOrigin;
};

type SignalRule = {
  type: SignalType;
  label: string;
  family: SignalFamily;
  weight: number;
  /** Trailing `*` means "and any word continuation", e.g. `reconcil*`. */
  keywords: string[];
};

export const SIGNAL_RULES: SignalRule[] = [
  {
    type: "MANUAL_PROCESS",
    label: "Manual process",
    family: "PAIN",
    weight: 1,
    keywords: [
      "manual",
      "manually",
      "by hand",
      "hand-keyed",
      "manual process",
      "manual reporting",
    ],
  },
  {
    type: "SPREADSHEET",
    label: "Spreadsheet dependency",
    family: "PAIN",
    weight: 1,
    keywords: [
      "excel",
      "spreadsheet*",
      "google sheets",
      "vlookup",
      "pivot table*",
      "xlsx",
      "workbook*",
    ],
  },
  {
    type: "RECONCILIATION",
    label: "Reconciliation work",
    family: "PAIN",
    weight: 1,
    keywords: ["reconcil*", "matching invoices", "cross-check*"],
  },
  {
    type: "DATA_ENTRY",
    label: "Data entry",
    family: "PAIN",
    weight: 1,
    keywords: [
      "data entry",
      "data-entry",
      "keying",
      "re-key*",
      "rekey*",
      "copy and paste",
      "copying information",
      "transcrib*",
    ],
  },
  {
    type: "DUPLICATE_ENTRY",
    label: "Duplicate entry",
    family: "PAIN",
    weight: 1.2,
    keywords: [
      "duplicate entry",
      "double entry",
      "entered twice",
      "entering the same",
      "same data twice",
    ],
  },
  {
    type: "CSV_EXPORT",
    label: "CSV / file shuffling",
    family: "PAIN",
    weight: 0.9,
    keywords: ["csv", "flat file*", "export the data", "exporting data"],
  },
  {
    type: "REPORTING",
    label: "Recurring reporting",
    family: "PAIN",
    weight: 0.9,
    keywords: [
      "weekly report*",
      "monthly report*",
      "management report*",
      "reporting pack*",
      "kpi report*",
      "board report*",
    ],
  },
  {
    type: "COMPLIANCE",
    label: "Compliance burden",
    family: "PAIN",
    weight: 0.8,
    keywords: ["compliance", "audit trail", "regulatory report*", "record keeping"],
  },
  {
    type: "ADMIN_PROCESSING",
    label: "Administrative processing",
    family: "PAIN",
    weight: 0.8,
    keywords: [
      "administrative processing",
      "back office",
      "back-office",
      "paperwork",
      "admin burden",
    ],
  },
  {
    type: "MULTIPLE_PLATFORMS",
    label: "Multiple disconnected systems",
    family: "PAIN",
    weight: 1.1,
    keywords: [
      "multiple systems",
      "multiple platforms",
      "several systems",
      "different systems",
      "disparate systems",
      "siloed",
      "not integrated",
      "no integration",
    ],
  },
  {
    type: "LEGACY_SOFTWARE",
    label: "Legacy software",
    family: "PAIN",
    weight: 1,
    keywords: [
      "legacy system*",
      "legacy software",
      "outdated system*",
      "access database",
      "as/400",
      "vba",
      "on-premise",
      "end of life",
    ],
  },
  {
    type: "FRAGMENTED_WORKFLOW",
    label: "Fragmented workflow",
    family: "PAIN",
    weight: 0.9,
    keywords: ["fragmented", "disjointed", "workaround*", "bottleneck*", "chasing updates"],
  },
  {
    type: "HIRING",
    label: "Hiring for operations",
    family: "HIRING",
    weight: 1,
    keywords: [
      "we are hiring",
      "we're hiring",
      "now hiring",
      "join our team",
      "open role*",
      "job opening*",
      "vacanc*",
      "operations coordinator",
      "operations manager",
      "operations administrator",
      "data administrator",
      "apply now",
    ],
  },
  {
    type: "GROWTH",
    label: "Growth",
    family: "GROWTH",
    weight: 1,
    keywords: [
      "rapid growth",
      "fast-growing",
      "fastest growing",
      "scaling up",
      "record year",
      "doubled our",
      "grew by",
      "series a",
      "series b",
    ],
  },
  {
    type: "ACQUISITION",
    label: "Recent acquisition",
    family: "TRIGGER",
    weight: 1.1,
    keywords: ["acquisition of", "has acquired", "we acquired", "merger with", "merged with"],
  },
  {
    type: "EXPANSION",
    label: "Market expansion",
    family: "TRIGGER",
    weight: 1,
    keywords: [
      "new market*",
      "expanding into",
      "expansion into",
      "new office",
      "opening a new",
      "new depot",
      "new warehouse",
    ],
  },
];

const RULE_BY_TYPE = new Map(SIGNAL_RULES.map((r) => [r.type, r]));

/**
 * Signal-to-hypothesis mapping (plan §10: "the AI should convert signals into
 * hypotheses"). Deliberately worded as possibilities — a keyword match is
 * evidence that a problem *may* exist, never proof that it does.
 */
export const SIGNAL_HYPOTHESES: Record<
  SignalType,
  { problem: string; solution: string; benefit: string }
> = {
  MANUAL_PROCESS: {
    problem: "Work described as manual is likely being done by a person on a schedule.",
    solution: "Automate the recurring steps and keep a human approval point.",
    benefit: "Hours returned each week and fewer transcription errors.",
  },
  SPREADSHEET: {
    problem: "Spreadsheets appear to be carrying a business process rather than a calculation.",
    solution: "Move the process into a small internal application with the numbers behind it.",
    benefit: "One version of the truth instead of a folder of workbooks.",
  },
  RECONCILIATION: {
    problem: "Records from two systems appear to be matched up by hand.",
    solution: "Automated matching with an exceptions queue for the cases that need judgement.",
    benefit: "Reconciliation shrinks to reviewing the exceptions.",
  },
  DATA_ENTRY: {
    problem: "Information looks like it is being retyped between systems.",
    solution: "An integration or import routine between the two systems.",
    benefit: "Data-entry time removed and typos eliminated.",
  },
  DUPLICATE_ENTRY: {
    problem: "The same information appears to be entered more than once.",
    solution: "Single point of entry that syncs onward automatically.",
    benefit: "Half the keystrokes and no divergence between systems.",
  },
  CSV_EXPORT: {
    problem: "Data seems to move between tools as exported files.",
    solution: "A scheduled pipeline that moves and validates the data directly.",
    benefit: "No more file shuffling, and failures become visible.",
  },
  REPORTING: {
    problem: "Recurring reports are likely to be assembled by hand each cycle.",
    solution: "An automated reporting pipeline feeding a live dashboard.",
    benefit: "Reports arrive on time without anyone building them.",
  },
  COMPLIANCE: {
    problem: "Compliance evidence may be collected manually at audit time.",
    solution: "Continuous capture with an automatic audit trail.",
    benefit: "Audit preparation becomes a download rather than a project.",
  },
  ADMIN_PROCESSING: {
    problem: "Administrative processing is consuming staff time.",
    solution: "Workflow automation for the repetitive parts of the process.",
    benefit: "Capacity released without adding headcount.",
  },
  MULTIPLE_PLATFORMS: {
    problem: "Several systems appear not to talk to each other.",
    solution: "Integration layer so records flow between the systems automatically.",
    benefit: "Staff stop being the integration between tools.",
  },
  LEGACY_SOFTWARE: {
    problem: "An ageing internal system appears to be constraining the work around it.",
    solution: "Wrap or incrementally replace the system rather than a big-bang rewrite.",
    benefit: "Modern workflow without a risky migration.",
  },
  FRAGMENTED_WORKFLOW: {
    problem: "The workflow appears to be held together by workarounds.",
    solution: "A single tool that models the actual process end to end.",
    benefit: "Fewer handoffs and less chasing.",
  },
  HIRING: {
    problem: "Hiring for operational roles often signals process volume outgrowing the process.",
    solution: "Automate the repetitive portion of the role before it is filled.",
    benefit: "The new hire spends time on judgement rather than keying.",
  },
  GROWTH: {
    problem: "Growth tends to break processes that worked at a smaller size.",
    solution: "Systems that scale with volume instead of with headcount.",
    benefit: "Growth without a proportional rise in admin cost.",
  },
  ACQUISITION: {
    problem: "Acquisitions leave two of everything: systems, processes, and reports.",
    solution: "Consolidated reporting across both estates while the systems merge.",
    benefit: "One view of the combined business, sooner.",
  },
  EXPANSION: {
    problem: "New locations or markets multiply the operational overhead.",
    solution: "Standardised, automated processes that a new site inherits on day one.",
    benefit: "Opening the next site costs less than the last.",
  },
};

export const SIGNAL_LABELS: Record<SignalType, string> = Object.fromEntries(
  SIGNAL_RULES.map((r) => [r.type, r.label]),
) as Record<SignalType, string>;

export const SIGNAL_TYPES = SIGNAL_RULES.map((r) => r.type);

/** At most this many signals of one type per source, so a keyword-stuffed page cannot dominate. */
const MAX_PER_TYPE_PER_SOURCE = 2;

/** Runs the keyword rules over retrieved text. */
export function detectSignals(sources: SignalSource[]): DetectedSignal[] {
  const out: DetectedSignal[] = [];

  for (const source of sources) {
    const text = source.text ?? "";
    if (!text.trim()) continue;

    for (const rule of SIGNAL_RULES) {
      let taken = 0;
      const seen = new Set<string>();

      for (const keyword of rule.keywords) {
        if (taken >= MAX_PER_TYPE_PER_SOURCE) break;
        const pattern = keywordPattern(keyword);
        for (const match of text.matchAll(pattern)) {
          if (taken >= MAX_PER_TYPE_PER_SOURCE) break;
          const evidence = sentenceAround(text, match.index ?? 0, match[0].length);
          const dedupeKey = evidence.toLowerCase();
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          taken += 1;
          out.push({
            type: rule.type,
            label: rule.label,
            family: rule.family,
            keyword: match[0].toLowerCase(),
            evidence,
            sourceId: source.id,
            sourceLabel: source.label,
            sourceUrl: source.url,
            weight: rule.weight,
            origin: "RULE",
          });
        }
      }
    }
  }

  return out;
}

/**
 * Combines rule hits with AI-proposed signals. Rule hits win on collision
 * because their provenance is exact — we know which sentence produced them.
 */
export function mergeSignals(
  ruleSignals: DetectedSignal[],
  aiSignals: DetectedSignal[],
): DetectedSignal[] {
  const merged = new Map<string, DetectedSignal>();
  for (const signal of [...ruleSignals, ...aiSignals]) {
    const key = `${signal.type}:${normalise(signal.evidence)}`;
    const existing = merged.get(key);
    if (!existing || (existing.origin === "AI" && signal.origin === "RULE")) {
      merged.set(key, signal);
    }
  }
  return [...merged.values()];
}

/** Normalises an AI-reported signal into the same shape as a rule hit. */
export function aiSignal(input: {
  type: string;
  evidence: string;
  sourceLabel?: string;
  sourceUrl?: string;
  sourceId?: string;
}): DetectedSignal | null {
  const type = normaliseType(input.type);
  if (!type) return null;
  const rule = RULE_BY_TYPE.get(type);
  const evidence = input.evidence?.trim();
  if (!evidence) return null;
  return {
    type,
    label: rule?.label ?? type,
    family: rule?.family ?? "PAIN",
    keyword: type.toLowerCase().replace(/_/g, " "),
    evidence: evidence.slice(0, 400),
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel ?? "AI analysis",
    sourceUrl: input.sourceUrl,
    // AI signals count slightly less than a verbatim keyword match.
    weight: (rule?.weight ?? 1) * 0.8,
    origin: "AI",
  };
}

/** Maps a free-form AI label onto a known signal type, or null when unrecognised. */
export function normaliseType(value: string): SignalType | null {
  const key = value?.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (SIGNAL_TYPES as string[]).includes(key) ? (key as SignalType) : null;
}

export function countByFamily(signals: DetectedSignal[]): Record<SignalFamily, number> {
  const counts: Record<SignalFamily, number> = { PAIN: 0, HIRING: 0, GROWTH: 0, TRIGGER: 0 };
  for (const signal of signals) counts[signal.family] += 1;
  return counts;
}

/** Distinct signal types, which is what the score cares about (not raw hits). */
export function distinctTypes(signals: DetectedSignal[]): SignalType[] {
  return [...new Set(signals.map((s) => s.type))];
}

function keywordPattern(keyword: string) {
  const wildcard = keyword.endsWith("*");
  const base = escapeRegex(wildcard ? keyword.slice(0, -1) : keyword);
  const tail = wildcard ? "\\w*" : "";
  const trailingBoundary = /\w$/.test(keyword) || wildcard ? "\\b" : "";
  return new RegExp(`\\b${base}${tail}${trailingBoundary}`, "gi");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Expands a match to the sentence around it, capped so the UI stays readable. */
function sentenceAround(text: string, index: number, length: number) {
  const windowStart = Math.max(0, index - 200);
  const windowEnd = Math.min(text.length, index + length + 200);
  const before = text.slice(windowStart, index);
  const after = text.slice(index + length, windowEnd);

  const startBreak = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("\n"),
    before.lastIndexOf("• "),
  );
  const endBreakCandidates = [after.indexOf(". "), after.indexOf("\n")].filter((i) => i >= 0);
  const endBreak = endBreakCandidates.length ? Math.min(...endBreakCandidates) : -1;

  const snippet =
    (startBreak >= 0 ? before.slice(startBreak + 1) : before) +
    text.slice(index, index + length) +
    (endBreak >= 0 ? after.slice(0, endBreak + 1) : after);

  return snippet.replace(/\s+/g, " ").trim().slice(0, 400);
}

function normalise(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
