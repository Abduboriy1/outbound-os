import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The lead finder's only real job is refusing to hand over companies it cannot
 * tie to a page the search actually read. A model asked for prospects will
 * produce fluent, entirely fictional businesses, and everything downstream —
 * research, scoring, outreach — would treat them as real. So the assertions
 * here are mostly about what does *not* come out.
 */

const icps = [
  {
    id: "icp_1",
    name: "Northern logistics",
    description: null,
    industries: ["Logistics"],
    geographies: ["North of England"],
    problems: ["manual reporting"],
    targetRoles: ["COO"],
    minEmployees: 20,
    maxEmployees: 200,
  },
];

let companies: { name: string; domain: string | null }[] = [];

const prismaMock = {
  icp: { findFirst: vi.fn(async () => icps[0]) },
  company: { findMany: vi.fn(async () => companies) },
  contact: { findMany: vi.fn(async () => []) },
};

/** What the grounded search "read". Candidates must trace back to these. */
let citations: { url: string; title?: string; domain?: string }[] = [];
/** What the extraction step returns. Deliberately includes invented companies. */
let extracted: Record<string, unknown>[] = [];
let notes: string[] = [];

const runGrounded = vi.fn(async (_options: { instruction: string }) => ({
  text: "search results",
  citations,
  queries: ["logistics companies leeds"],
  model: "gemini-2.5-pro",
  provider: "gemini",
  latencyMs: 10,
  runId: "run_search",
}));

let queryPlan = ["logistics companies leeds"];

/**
 * Both AI calls in the search-API path go through `run`, so the mock answers
 * whichever one it was handed — the query plan, or the extraction.
 */
const run = vi.fn(async (options: { request: { instruction: string } }) => {
  const isPlan = options.request.instruction.includes("search queries");
  return {
    data: isPlan ? { queries: queryPlan } : { companies: extracted, notes },
    runId: isPlan ? "run_plan" : "run_extract",
    rawText: "{}",
    model: "gemini-3.6-flash",
    provider: "gemini",
    latencyMs: 10,
    injectionFindings: [] as { rule: string; match: string }[],
  };
});

let searchProviderName = "mock";
const fetchPage = vi.fn(async (_url: string) => null as { title: string; text: string } | null);
const vendorSearch = vi.fn(
  async (_query: string, _limit?: number) =>
    [] as { title: string; url: string; snippet: string }[],
);

/** Set to switch `discoverLeads` onto the search-API strategy. */
let searchApiKey = "";

vi.mock("~~/server/lib/db", () => ({ prisma: prismaMock }));
vi.mock("~~/server/lib/ai/service", () => ({
  aiService: () => ({ run, runGrounded }),
}));
vi.mock("~~/server/lib/research/search", () => ({
  getSearchProvider: () => ({ name: searchProviderName, fetchPage, search: vendorSearch }),
}));
vi.mock("~~/server/lib/env", () => ({ env: () => ({ SEARCH_API_KEY: searchApiKey }) }));

const { discoverLeads, citedBy } = await import("./prospect");

function company(overrides: Record<string, unknown> = {}) {
  return {
    name: "Northgate Freight",
    domain: "northgate-freight.co.uk",
    industry: "Logistics",
    location: "Leeds",
    employee_count: 60,
    description: "Regional haulier.",
    match_reason: "Careers page describes manual weekly reporting.",
    source_url: "https://northgate-freight.co.uk/careers",
    match_confidence: 0.8,
    ...overrides,
  };
}

beforeEach(() => {
  companies = [];
  citations = [{ url: "https://x/1", title: "northgate-freight.co.uk", domain: "northgate-freight.co.uk" }];
  extracted = [company()];
  notes = [];
  queryPlan = ["logistics companies leeds"];
  searchProviderName = "mock";
  searchApiKey = "";
  fetchPage.mockReset();
  fetchPage.mockResolvedValue(null);
  vendorSearch.mockReset();
  vendorSearch.mockResolvedValue([]);
  run.mockClear();
  runGrounded.mockClear();
});

describe("discoverLeads", () => {
  it("offers a company the search actually cited", async () => {
    const result = await discoverLeads({ userId: "u1" });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.lead.companyName).toBe("Northgate Freight");
    expect(result.candidates[0]!.lead.website).toBe("https://northgate-freight.co.uk");
    expect(result.candidates[0]!.verifiedBy).toBe("citation");
    expect(result.rejected).toHaveLength(0);
  });

  it("drops a company that was not among the pages the search read", async () => {
    extracted = [company(), company({ name: "Invented Ltd", domain: "invented-ltd.co.uk" })];

    const result = await discoverLeads({ userId: "u1" });

    expect(result.candidates.map((c) => c.lead.companyName)).toEqual(["Northgate Freight"]);
    expect(result.rejected).toEqual([
      {
        name: "Invented Ltd",
        domain: "invented-ltd.co.uk",
        reason: "Not among the pages the search retrieved.",
      },
    ]);
  });

  it("drops a company with no domain rather than guessing one", async () => {
    extracted = [company({ name: "Nameless Co", domain: null })];

    const result = await discoverLeads({ userId: "u1" });

    expect(result.candidates).toHaveLength(0);
    expect(result.rejected[0]!.reason).toBe("The search did not give a website domain.");
  });

  it("accepts an uncited domain only when it responds, and only on the http provider", async () => {
    searchProviderName = "http";
    extracted = [company({ name: "Real But Uncited", domain: "real-uncited.co.uk" })];
    fetchPage.mockResolvedValue({ title: "Real", text: "We are a real haulier." });

    const result = await discoverLeads({ userId: "u1" });

    expect(fetchPage).toHaveBeenCalledWith("https://real-uncited.co.uk/");
    expect(result.candidates[0]!.verifiedBy).toBe("live");
  });

  it("does not reach the network when the search provider is the mock", async () => {
    extracted = [company({ name: "Uncited", domain: "uncited.co.uk" })];

    const result = await discoverLeads({ userId: "u1" });

    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.candidates).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("Live domain checks are off"))).toBe(true);
  });

  it("keeps companies already in the pipeline out of the candidate list", async () => {
    companies = [{ name: "Northgate Freight", domain: "northgate-freight.co.uk" }];

    const result = await discoverLeads({ userId: "u1" });

    expect(result.candidates).toHaveLength(0);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]!.reason).toBe("domain");
  });

  it("tells the search which domains are already known", async () => {
    companies = [{ name: "Known Ltd", domain: "known.co.uk" }];
    await discoverLeads({ userId: "u1" });

    const instruction = runGrounded.mock.calls.at(-1)![0].instruction;
    expect(instruction).toContain("known.co.uk");
  });

  it("collapses a company the model listed twice", async () => {
    extracted = [company(), company({ description: "Same firm, second mention." })];

    const result = await discoverLeads({ userId: "u1" });

    expect(result.candidates).toHaveLength(1);
  });

  it("clamps the requested count to the ceiling", async () => {
    await discoverLeads({ userId: "u1", count: 500 });

    const instruction = runGrounded.mock.calls.at(-1)![0].instruction;
    expect(instruction).toContain("up to 25 real companies");
  });

  it("warns when the search reported no sources at all", async () => {
    citations = [];

    const result = await discoverLeads({ userId: "u1" });

    expect(result.warnings.some((w) => w.includes("No sources were retrieved"))).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("discoverLeads on the search-API strategy", () => {
  /** The extraction call, as distinct from the query-plan call. */
  function extractionCall() {
    return run.mock.calls
      .map((call) => call[0] as { request: { instruction: string; data?: unknown[] } })
      .find((call) => call.request.instruction.includes("Extract up to"));
  }

  /** Puts `discoverLeads` on the vendor path with one fetchable result page. */
  function useSearchApi(
    hits = [
      { title: "Leeds haulier directory", url: "https://directory.example/leeds", snippet: "..." },
    ],
  ) {
    searchProviderName = "http";
    searchApiKey = "key_123";
    vendorSearch.mockResolvedValue(hits);
    fetchPage.mockImplementation(async (url: string) =>
      url.startsWith("https://directory.example")
        ? { title: "Leeds haulier directory", text: "Northgate Freight — northgate-freight.co.uk" }
        : null,
    );
  }

  it("prefers the vendor path over grounding when a key is configured", async () => {
    useSearchApi();
    const result = await discoverLeads({ userId: "u1" });

    expect(result.strategy).toBe("search-api");
    expect(runGrounded).not.toHaveBeenCalled();
    expect(vendorSearch).toHaveBeenCalledWith("logistics companies leeds", 8);
  });

  it("verifies against the pages it fetched, not against the model's say-so", async () => {
    useSearchApi();
    // The extractor names a company on a domain the run never retrieved.
    extracted = [company({ name: "Invented Ltd", domain: "invented-ltd.co.uk" })];
    // Its domain answers, so it survives — but as `live`, not `citation`.
    fetchPage.mockImplementation(async (url: string) =>
      url.startsWith("https://directory.example")
        ? { title: "Directory", text: "a list of hauliers" }
        : { title: "Invented", text: "we exist" },
    );

    const result = await discoverLeads({ userId: "u1" });

    expect(result.citations.map((c) => c.domain)).toEqual(["directory.example"]);
    expect(result.candidates[0]!.verifiedBy).toBe("live");
  });

  /**
   * On `request.data`, not folded into the instruction — that is the field
   * AIService sanitises and scans for injection, so a page smuggled in through
   * the instruction instead would bypass both.
   */
  it("passes each retrieved page to the extractor as an untrusted document", async () => {
    useSearchApi([
      { title: "Directory A", url: "https://directory.example/leeds", snippet: "..." },
      { title: "Directory B", url: "https://other.example/list", snippet: "fallback snippet" },
    ]);

    await discoverLeads({ userId: "u1" });

    expect(extractionCall()!.request.data).toHaveLength(2);
  });

  /** A dead link is routine; it must not take the whole run down with it. */
  it("falls back to the result snippet when a page will not load", async () => {
    useSearchApi([
      { title: "Unfetchable", url: "https://dead.example/list", snippet: "Northgate Freight, Leeds" },
    ]);
    fetchPage.mockResolvedValue(null);

    const result = await discoverLeads({ userId: "u1" });

    expect(result.citations).toHaveLength(1);
    const extract = extractionCall();
    expect((extract!.request.data as { content: string }[])[0]!.content).toBe(
      "Northgate Freight, Leeds",
    );
  });

  it("does not spend a fetch on a domain already in the pipeline", async () => {
    companies = [{ name: "Known Ltd", domain: "directory.example" }];
    useSearchApi();

    await discoverLeads({ userId: "u1" });

    expect(fetchPage).not.toHaveBeenCalledWith("https://directory.example/leeds");
  });

  it("says so when the vendor returns nothing", async () => {
    useSearchApi([]);

    const result = await discoverLeads({ userId: "u1" });

    expect(result.warnings.some((w) => w.includes("no results"))).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });
});

describe("citedBy", () => {
  const cited = new Set(["acme.co.uk", "careers.bigco.com"]);

  it("matches the domain itself", () => {
    expect(citedBy("acme.co.uk", cited)).toBe(true);
  });

  it("matches across subdomains in both directions", () => {
    expect(citedBy("bigco.com", cited)).toBe(true);
    expect(citedBy("shop.acme.co.uk", cited)).toBe(true);
  });

  it("does not let a lookalike domain pass as a cited one", () => {
    expect(citedBy("notacme.co.uk", cited)).toBe(false);
    expect(citedBy("acme.co.uk.evil.com", cited)).toBe(false);
  });
});
