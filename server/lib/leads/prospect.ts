/**
 * AI lead discovery (plan §8) — the `search` LeadProvider the interface always
 * had a slot for.
 *
 * Sequence:
 *   ICP → web search → structured extraction → citation check →
 *   dedupe against live rows → preview for a human
 *
 * The search step has two implementations, because the two ways to reach the
 * live web fail in different places and most deployments have only one:
 *
 *   `search-api` — a search vendor answers the queries and this app fetches
 *     every result page itself, through the SSRF-hardened reader. Preferred
 *     when configured: the citations are pages we actually retrieved and read,
 *     not pages a provider says it read.
 *   `grounded` — the model provider runs its own searches and reports what it
 *     consulted. No search key needed, but Google Search grounding is billed
 *     separately from tokens, so it is unavailable on an unbilled key.
 *
 * Both converge on the same verification gate, which is the part that matters.
 * A language model asked for companies will produce a fluent list of businesses
 * that do not exist, with domains that resolve to nothing, and every downstream
 * stage — research, scoring, outreach — would treat them as real. So a
 * candidate is only offered if its domain was among the sources actually
 * retrieved, or if the domain answers when fetched. Anything else is dropped
 * and counted, never silently passed on.
 *
 * Nothing here writes a lead. It returns a preview; `POST /api/import` commits
 * whatever the operator approves, exactly as the CSV importer does.
 */

import type { DiscoveredLead, UntrustedDocument } from "~~/server/lib/contracts";
import { prisma } from "~~/server/lib/db";
import { aiService } from "~~/server/lib/ai/service";
import {
  buildProspectExtractionRequest,
  buildProspectingSearch,
  buildQueryPlanRequest,
  prospectingOutputSchema,
  queryPlanOutputSchema,
  type ProspectingIcp,
} from "~~/server/lib/ai/agents/prospecting";
import { getSearchProvider } from "~~/server/lib/research/search";
import { env } from "~~/server/lib/env";
import { dedupeLeads, normalizeDomain, websiteFromDomain } from "~~/shared/leadsources";
import type { DedupeResult } from "~~/shared/leadsources";

export const MAX_DISCOVERY_COUNT = 25;
/** Result pages read per run. Each is one HTTP fetch and one slice of prompt. */
const MAX_PAGES = 12;
const MAX_PAGE_CHARS = 12_000;

export type DiscoveryStrategy = "search-api" | "grounded";

/** How a candidate earned its place in the preview. */
export type VerificationMethod = "citation" | "live";

export type ProspectCandidate = {
  lead: DiscoveredLead;
  matchReason: string;
  sourceUrl: string | null;
  confidence: number;
  verifiedBy: VerificationMethod;
};

export type RejectedCandidate = {
  name: string;
  domain: string | null;
  reason: string;
};

export type DiscoverLeadsResult = {
  candidates: ProspectCandidate[];
  duplicates: DedupeResult["duplicates"];
  /** Candidates the model produced that could not be verified. */
  rejected: RejectedCandidate[];
  notes: string[];
  warnings: string[];
  queries: string[];
  citations: { url: string; title?: string; domain?: string }[];
  strategy: DiscoveryStrategy;
  searchRunId: string;
  extractRunId: string;
  provider: string;
  model: string;
};

export async function discoverLeads(options: {
  userId: string;
  icpId?: string | null;
  count?: number;
  criteria?: string | null;
}): Promise<DiscoverLeadsResult> {
  const count = Math.min(Math.max(options.count ?? 10, 1), MAX_DISCOVERY_COUNT);
  const warnings: string[] = [];

  const icpRecord = options.icpId
    ? await prisma.icp.findFirst({
        where: { id: options.icpId, userId: options.userId, deletedAt: null },
      })
    : await prisma.icp.findFirst({
        where: { userId: options.userId, deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });

  if (!icpRecord) {
    warnings.push(
      "No ideal customer profile was found, so the search ran on the free-text criteria alone.",
    );
  }

  const icp: ProspectingIcp | null = icpRecord
    ? {
        name: icpRecord.name,
        description: icpRecord.description,
        industries: icpRecord.industries,
        geographies: icpRecord.geographies,
        problems: icpRecord.problems,
        targetRoles: icpRecord.targetRoles,
        minEmployees: icpRecord.minEmployees,
        maxEmployees: icpRecord.maxEmployees,
      }
    : null;

  /* ------------------------------------------------ known companies to skip */
  const companies = await prisma.company.findMany({
    where: { userId: options.userId, deletedAt: null },
    select: { name: true, domain: true },
    take: 1000,
  });
  const contacts = await prisma.contact.findMany({
    where: { userId: options.userId, deletedAt: null },
    select: { firstName: true, lastName: true, email: true },
    take: 1000,
  });
  const knownDomains = companies
    .map((company) => normalizeDomain(company.domain))
    .filter((domain): domain is string => Boolean(domain));

  /* ------------------------------------------------------- 1. reach the web */
  const service = aiService();
  const provider = getSearchProvider();
  const config = env();

  // The search API path is preferred where it is configured: its citations are
  // pages this app fetched and read, which is a stronger claim than a provider
  // reporting what it consulted.
  const strategy: DiscoveryStrategy =
    provider.name === "http" && config.SEARCH_API_KEY ? "search-api" : "grounded";

  const gathered =
    strategy === "search-api"
      ? await gatherViaSearchApi({
          userId: options.userId,
          icp,
          count,
          criteria: options.criteria ?? null,
          knownDomains,
          provider,
          warnings,
        })
      : await gatherViaGrounding({
          userId: options.userId,
          icp,
          count,
          criteria: options.criteria ?? null,
          knownDomains,
        });

  if (gathered.citations.length === 0) {
    warnings.push(
      "No sources were retrieved, so nothing can be verified and no candidates will be offered.",
    );
  }

  /* --------------------------------------------------- 2. structure the text */
  const extraction = await service.run({
    agent: "prospecting",
    userId: options.userId,
    schema: prospectingOutputSchema,
    request: buildProspectExtractionRequest({
      documents: gathered.documents,
      citations: gathered.citations,
      icp,
      count,
    }),
  });

  if (extraction.injectionFindings.length) {
    warnings.push(
      `${extraction.injectionFindings.length} instruction-shaped fragment(s) were removed from the search results before extraction.`,
    );
  }

  /* ------------------------------------------------------- 3. verify domains */
  const citationDomains = new Set(
    gathered.citations
      .map((citation) => normalizeDomain(citation.domain ?? null))
      .filter((domain): domain is string => Boolean(domain)),
  );

  const canCheckLive = provider.name === "http";
  if (!canCheckLive) {
    warnings.push(
      "Live domain checks are off because SEARCH_PROVIDER is not `http`, so candidates are accepted on the search citations alone.",
    );
  }

  const candidates: ProspectCandidate[] = [];
  const rejected: RejectedCandidate[] = [];
  const seen = new Set<string>();

  for (const company of extraction.data.companies) {
    const name = company.name?.trim();
    if (!name) continue;

    const domain = normalizeDomain(company.domain);
    if (!domain) {
      rejected.push({ name, domain: null, reason: "The search did not give a website domain." });
      continue;
    }
    if (seen.has(domain)) continue;
    seen.add(domain);

    let verifiedBy: VerificationMethod | null = citedBy(domain, citationDomains)
      ? "citation"
      : null;

    if (!verifiedBy && canCheckLive) {
      const live = await provider
        .fetchPage(`https://${domain}/`)
        .catch(() => null);
      if (live?.text?.trim()) verifiedBy = "live";
    }

    if (!verifiedBy) {
      rejected.push({
        name,
        domain,
        reason: canCheckLive
          ? "Not among the pages the search retrieved, and the domain did not respond."
          : "Not among the pages the search retrieved.",
      });
      continue;
    }

    candidates.push({
      lead: {
        companyName: name,
        domain,
        website: websiteFromDomain(domain) ?? undefined,
        industry: company.industry ?? undefined,
        location: company.location ?? undefined,
        employeeCount: company.employee_count ?? undefined,
        description: company.description ?? undefined,
        sourceDetail: sourceDetail(company.source_url, gathered.provider),
      },
      matchReason: company.match_reason,
      sourceUrl: company.source_url,
      confidence: company.match_confidence,
      verifiedBy,
    });
  }

  /* --------------------------------------------- 4. dedupe against live rows */
  const deduped = dedupeLeads(
    candidates.map((candidate) => candidate.lead),
    [
      ...companies.map((company) => ({ domain: company.domain, label: company.name })),
      ...contacts.map((contact) => ({
        email: contact.email,
        label: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
      })),
    ],
  );

  const uniqueIndexes = new Set(deduped.unique.map((entry) => entry.index));

  return {
    candidates: candidates.filter((_, index) => uniqueIndexes.has(index)),
    duplicates: deduped.duplicates,
    rejected,
    notes: extraction.data.notes,
    warnings,
    queries: gathered.queries,
    citations: gathered.citations,
    strategy,
    searchRunId: gathered.runId,
    extractRunId: extraction.runId,
    provider: gathered.provider,
    model: gathered.model,
  };
}

/* ------------------------------------------------------------- gatherers */

type Gathered = {
  documents: UntrustedDocument[];
  citations: { url: string; title?: string; domain?: string }[];
  queries: string[];
  runId: string;
  provider: string;
  model: string;
};

/**
 * Search vendor answers the queries; this app fetches and reads every result
 * page itself. Two model calls bracket it: one to plan the queries, and the
 * extraction the caller runs afterwards.
 *
 * A page that fails to fetch is skipped rather than fatal. One dead link in ten
 * is normal, and a run that returns nine good pages beats a run that returns an
 * error.
 */
async function gatherViaSearchApi(input: {
  userId: string;
  icp: ProspectingIcp | null;
  count: number;
  criteria: string | null;
  knownDomains: string[];
  provider: { name: string; search: (q: string, limit?: number) => Promise<{ title: string; url: string; snippet: string }[]>; fetchPage: (url: string) => Promise<{ title: string; text: string } | null> };
  warnings: string[];
}): Promise<Gathered> {
  const service = aiService();

  const plan = await service.run({
    agent: "prospecting",
    userId: input.userId,
    schema: queryPlanOutputSchema,
    request: buildQueryPlanRequest({
      icp: input.icp,
      criteria: input.criteria,
      count: input.count,
    }),
  });

  const known = new Set(input.knownDomains);
  const results = new Map<string, { title: string; url: string; snippet: string }>();

  for (const query of plan.data.queries) {
    const hits = await input.provider.search(query, 8);
    for (const hit of hits) {
      const domain = normalizeDomain(hostnameOf(hit.url));
      // A page on a company we already have is not worth a fetch; the extractor
      // would only produce a candidate the dedupe drops.
      if (domain && known.has(domain)) continue;
      if (!results.has(hit.url)) results.set(hit.url, hit);
    }
  }

  if (results.size === 0) {
    input.warnings.push(
      "The search vendor returned no results. Check SEARCH_API_KEY, or widen the ICP.",
    );
  }

  const documents: UntrustedDocument[] = [];
  const citations: Gathered["citations"] = [];

  for (const hit of [...results.values()].slice(0, MAX_PAGES)) {
    const page = await input.provider.fetchPage(hit.url).catch(() => null);
    const content = page?.text?.trim() ? page.text.slice(0, MAX_PAGE_CHARS) : hit.snippet;
    if (!content?.trim()) continue;

    documents.push({ label: page?.title ?? hit.title, url: hit.url, content });
    citations.push({
      url: hit.url,
      title: page?.title ?? hit.title,
      domain: normalizeDomain(hostnameOf(hit.url)) ?? undefined,
    });
  }

  return {
    documents,
    citations,
    queries: plan.data.queries,
    runId: plan.runId,
    provider: plan.provider,
    model: plan.model,
  };
}

/** The provider runs its own searches and reports what it consulted. */
async function gatherViaGrounding(input: {
  userId: string;
  icp: ProspectingIcp | null;
  count: number;
  criteria: string | null;
  knownDomains: string[];
}): Promise<Gathered> {
  const search = buildProspectingSearch({
    icp: input.icp,
    count: input.count,
    criteria: input.criteria,
    excludeDomains: input.knownDomains,
  });

  const grounded = await aiService().runGrounded({
    agent: "prospecting",
    userId: input.userId,
    system: search.system,
    instruction: search.instruction,
  });

  return {
    documents: [{ label: "Web search results", content: grounded.text }],
    citations: grounded.citations,
    queries: grounded.queries,
    runId: grounded.runId,
    provider: grounded.provider,
    model: grounded.model,
  };
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * A candidate counts as cited when the search read that domain or one of its
 * subdomains — a company found on `careers.acme.co.uk` is still Acme. The match
 * is anchored on a dot so `notacme.co.uk` cannot pass as `acme.co.uk`.
 */
export function citedBy(domain: string, citationDomains: Set<string>) {
  if (citationDomains.has(domain)) return true;
  for (const cited of citationDomains) {
    if (cited.endsWith(`.${domain}`) || domain.endsWith(`.${cited}`)) return true;
  }
  return false;
}

function sourceDetail(sourceUrl: string | null, provider: string) {
  const base = `Found by AI search (${provider})`;
  if (!sourceUrl) return base;
  try {
    return `${base} via ${new URL(sourceUrl).hostname}`.slice(0, 200);
  } catch {
    return base;
  }
}
