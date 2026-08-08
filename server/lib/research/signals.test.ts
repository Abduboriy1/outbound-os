import { describe, expect, it } from "vitest";
import {
  SIGNAL_HYPOTHESES,
  SIGNAL_RULES,
  aiSignal,
  countByFamily,
  detectSignals,
  distinctTypes,
  mergeSignals,
  normaliseType,
  type SignalSource,
} from "./signals";

function source(text: string, overrides: Partial<SignalSource> = {}): SignalSource {
  return { label: "Careers page", url: "https://acme.example/careers", text, ...overrides };
}

describe("detectSignals", () => {
  it("finds nothing in text with no operational signal", () => {
    expect(detectSignals([source("We deliver parcels across the region every day.")])).toEqual([]);
  });

  const cases: [string, string][] = [
    ["MANUAL_PROCESS", "The weekly figures are compiled manually by the operations team."],
    ["SPREADSHEET", "Reporting is built in Excel each Monday."],
    ["RECONCILIATION", "Invoices are reconciled against supplier statements monthly."],
    ["DATA_ENTRY", "The role involves data entry into two separate systems."],
    ["DUPLICATE_ENTRY", "Staff currently perform duplicate entry across both platforms."],
    ["CSV_EXPORT", "Orders are pulled out as a CSV every evening."],
    ["REPORTING", "A weekly report goes to the management team."],
    ["COMPLIANCE", "We maintain a full audit trail for every shipment."],
    ["ADMIN_PROCESSING", "The back office handles a large volume of paperwork."],
    ["MULTIPLE_PLATFORMS", "Our records live across multiple systems that are not integrated."],
    ["LEGACY_SOFTWARE", "The despatch tool is a legacy system nearing end of life."],
    ["FRAGMENTED_WORKFLOW", "The process is fragmented and full of workarounds."],
    ["HIRING", "We are hiring an Operations Coordinator to join our team."],
    ["GROWTH", "Following rapid growth we have opened a second site."],
    ["ACQUISITION", "Last year we completed the acquisition of a regional rival."],
    ["EXPANSION", "We are expanding into two new markets this year."],
  ];

  it.each(cases)("detects %s", (type, text) => {
    const signals = detectSignals([source(text)]);
    expect(signals.map((s) => s.type)).toContain(type);
  });

  it("attaches the evidence sentence and the source to each signal", () => {
    const signals = detectSignals([
      source(
        "We ship nationwide. The weekly management report is produced in Excel by hand. Contact us.",
        { id: "src_1", label: "Services", url: "https://acme.example/services" },
      ),
    ]);
    const spreadsheet = signals.find((s) => s.type === "SPREADSHEET");
    expect(spreadsheet).toBeDefined();
    expect(spreadsheet!.evidence).toContain("Excel");
    expect(spreadsheet!.evidence).not.toContain("Contact us");
    expect(spreadsheet!.sourceId).toBe("src_1");
    expect(spreadsheet!.sourceUrl).toBe("https://acme.example/services");
    expect(spreadsheet!.sourceLabel).toBe("Services");
    expect(spreadsheet!.origin).toBe("RULE");
  });

  it("matches whole words only", () => {
    // "excellent" must not trigger the Excel rule.
    const signals = detectSignals([source("Our excellent team delivers on time.")]);
    expect(signals.map((s) => s.type)).not.toContain("SPREADSHEET");
  });

  it("supports wildcard keywords", () => {
    const signals = detectSignals([source("Reconciling the ledger takes two days a month.")]);
    expect(signals.map((s) => s.type)).toContain("RECONCILIATION");
  });

  it("caps how many hits one source can contribute per type", () => {
    const spammy = Array.from({ length: 20 }, (_, i) => `Excel is used in process ${i}.`).join(" ");
    const signals = detectSignals([source(spammy)]);
    expect(signals.filter((s) => s.type === "SPREADSHEET").length).toBeLessThanOrEqual(2);
  });

  it("keeps signals from different sources apart", () => {
    const signals = detectSignals([
      source("Reporting is done in Excel.", { id: "a", label: "A", url: "https://a.example" }),
      source("Reporting is done in Excel.", { id: "b", label: "B", url: "https://b.example" }),
    ]);
    expect(new Set(signals.map((s) => s.sourceId))).toEqual(new Set(["a", "b"]));
  });

  it("ignores blank sources", () => {
    expect(detectSignals([source("   ")])).toEqual([]);
  });

  it("assigns every signal to a family", () => {
    const signals = detectSignals([
      source("We are hiring an Operations Coordinator."),
      source("Reporting is manual and done in Excel."),
      source("Following rapid growth we opened a new office."),
    ]);
    const families = countByFamily(signals);
    expect(families.HIRING).toBeGreaterThan(0);
    expect(families.PAIN).toBeGreaterThan(0);
    expect(families.GROWTH).toBeGreaterThan(0);
  });
});

describe("mergeSignals", () => {
  it("prefers the rule hit when both find the same evidence", () => {
    const rule = detectSignals([source("Reporting is done in Excel each week.")]);
    const ai = rule.map((signal) => ({ ...signal, origin: "AI" as const, weight: 0.5 }));
    const merged = mergeSignals(rule, ai);
    expect(merged).toHaveLength(rule.length);
    expect(merged.every((signal) => signal.origin === "RULE")).toBe(true);
  });

  it("keeps AI signals the rules did not find", () => {
    const rule = detectSignals([source("Reporting is done in Excel.")]);
    const extra = aiSignal({
      type: "MULTIPLE_PLATFORMS",
      evidence: "The site implies order data is held in two places.",
      sourceLabel: "AI analysis",
    })!;
    const merged = mergeSignals(rule, [extra]);
    expect(merged.map((s) => s.type)).toContain("MULTIPLE_PLATFORMS");
  });

  it("does not double-count identical evidence from the same type", () => {
    const rule = detectSignals([source("Reporting is done in Excel.")]);
    expect(mergeSignals(rule, rule)).toHaveLength(rule.length);
  });
});

describe("aiSignal", () => {
  it("normalises a free-form type", () => {
    expect(aiSignal({ type: "manual process", evidence: "x" })?.type).toBe("MANUAL_PROCESS");
    expect(aiSignal({ type: "data-entry", evidence: "x" })?.type).toBe("DATA_ENTRY");
  });

  it("rejects an unknown type rather than inventing one", () => {
    expect(aiSignal({ type: "vibes", evidence: "x" })).toBeNull();
  });

  it("rejects a signal with no evidence", () => {
    expect(aiSignal({ type: "SPREADSHEET", evidence: "  " })).toBeNull();
  });

  it("weights AI signals below rule hits", () => {
    const ai = aiSignal({ type: "SPREADSHEET", evidence: "Some evidence" })!;
    const rule = detectSignals([source("Reporting is done in Excel.")])[0];
    expect(ai.weight).toBeLessThan(rule.weight);
    expect(ai.origin).toBe("AI");
  });
});

describe("rule table", () => {
  it("has a hypothesis for every signal type", () => {
    for (const rule of SIGNAL_RULES) {
      expect(SIGNAL_HYPOTHESES[rule.type]).toBeDefined();
      expect(SIGNAL_HYPOTHESES[rule.type].problem.length).toBeGreaterThan(10);
    }
  });

  it("has no duplicate types", () => {
    const types = SIGNAL_RULES.map((rule) => rule.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("normaliseType only accepts known types", () => {
    expect(normaliseType("SPREADSHEET")).toBe("SPREADSHEET");
    expect(normaliseType("nonsense")).toBeNull();
  });
});

describe("distinctTypes", () => {
  it("collapses repeated types", () => {
    const signals = detectSignals([
      source("Excel is used for reporting."),
      source("Excel is used for invoicing.", { id: "b", label: "B" }),
    ]);
    expect(distinctTypes(signals)).toEqual(["SPREADSHEET"]);
  });
});
