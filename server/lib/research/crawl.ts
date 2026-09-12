/**
 * Source gathering for a research run — the part that behaves like a person
 * with a browser and a search engine.
 *
 * Three moves, in order:
 *   1. Read the company's own site: the usual paths, then FOLLOW the nav —
 *      a "Team", "Leadership" or "Contact" link found on any fetched page is
 *      queued ahead of everything else, because that is where names, emails,
 *      phone and fax numbers live. This is what a human does on arrival.
 *   2. Ask the SearchPlanAgent what a human would search for next, given what
 *      the site yielded, then run those queries through the search provider
 *      and read the best new results.
 *   3. Emit a trace event for every fetch, every followed link, and every
 *      query — with its reasoning — so the whole hunt can be audited from the
 *      run's activity log afterwards.
 *
 * Every URL still goes through the provider's fetch (SSRF-guarded, capped),
 * and every retrieved page stays untrusted data (plan §36).
 */

import type { PageLink } from "~~/server/lib/contracts";
import { env } from "~~/server/lib/env";
import { aiService } from "~~/server/lib/ai/service";
import {
  buildSearchPlanRequest,
  normaliseSearchPlan,
  searchPlanSchema,
} from "~~/server/lib/ai/agents/searchplan";
import { getSearchProvider } from "./search";
import { SAMPLE_PATHS } from "./search/mock";

export type FetchedPage = { kind: string; url: string; title: string; text: string };

export type CrawlEvent = {
  section: "company" | "people";
  stage: string;
  status: "started" | "done" | "warning";
  label: string;
  detail?: string;
};

export type CrawlOptions = {
  company: { name: string; domain: string | null; website: string | null };
  userId: string;
  leadId: string;
  warnings: string[];
  /** Trace hook; the pipeline wires this to the run's progress log. */
  emit: (event: CrawlEvent) => Promise<void>;
};

/** Paths tried on a company's own website before any links are followed. */
const SITE_PATHS = [
  "/",
  "/about",
  "/about-us",
  "/services",
  "/careers",
  "/jobs",
  "/news",
  "/team",
  "/contact",
  "/contact-us",
];

const MAX_SOURCES = 14;
/** Nav links followed beyond the seeded paths. */
const MAX_FOLLOWED_LINKS = 6;
const MAX_SEARCH_QUERIES = 5;
const RESULTS_PER_QUERY = 4;
/** Search results actually fetched per query — the rest are logged only. */
const FETCHES_PER_QUERY = 2;

/**
 * Where people hide in site navigation. Matched against both the link's label
 * ("Meet the Team") and its path (/our-people), because sites use either.
 */
const PEOPLE_LINK =
  /\b(team|leadership|staff|people|board|directors?|trustees|officers|management|executives?|founders?|who[\s-]we[\s-]are|meet[\s-]the|our[\s-]people|contact|advisors?|membership[\s-]directory|directory)\b/i;

/** Nav links worth following for company context, at lower priority. */
const COMPANY_LINK = /\b(about|services?|solutions?|products?|news|press|blog|careers?|jobs)\b/i;

export function kindForPath(value: string) {
  if (/contact/i.test(value)) return "CONTACT";
  if (/team|leadership|staff|people|board|director|management|officer/i.test(value))
    return "TEAM";
  if (/career|job|vacanc|hiring/i.test(value)) return "JOB_POSTING";
  if (/news|blog|press/i.test(value)) return "NEWS";
  if (/about|company/i.test(value)) return "ABOUT";
  if (/service|product|solution/i.test(value)) return "SERVICES";
  return "WEBSITE";
}

/** People-ish pages log under the people section of the activity view. */
function sectionForKind(kind: string): CrawlEvent["section"] {
  return kind === "TEAM" || kind === "CONTACT" ? "people" : "company";
}

export function baseUrl(website: string | null, domain: string | null) {
  const raw = website?.trim() || (domain?.trim() ? `https://${domain.trim()}` : null);
  if (!raw) return null;
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

/**
 * Scores a link for following. People pages outrank company pages; anything
 * else scores zero and is ignored. Only same-host links qualify — offsite
 * discovery is the search planner's job, where each step is logged with a
 * reason.
 */
export function scoreLink(link: PageLink, host: string): number {
  let url: URL;
  try {
    url = new URL(link.url);
  } catch {
    return 0;
  }
  if (url.hostname !== host) return 0;
  if (/\.(pdf|zip|docx?|xlsx?|pptx?|jpe?g|png|gif|svg|mp4|webp)$/i.test(url.pathname)) return 0;

  const haystack = `${link.label} ${url.pathname}`;
  if (PEOPLE_LINK.test(haystack)) return 2;
  if (COMPANY_LINK.test(haystack)) return 1;
  return 0;
}

export async function gatherSources(options: CrawlOptions): Promise<FetchedPage[]> {
  const provider = getSearchProvider();
  const pages: FetchedPage[] = [];
  const seen = new Set<string>();
  const keyOf = (url: string) => url.replace(/\/$/, "");

  const base = baseUrl(options.company.website, options.company.domain);
  const host = base ? new URL(base).hostname : null;

  /* ------------------------------------------- 1. the company's own site */
  const frontier: { kind: string; url: string; via?: string }[] = [];
  if (base) {
    const paths = provider.name === "mock" ? SAMPLE_PATHS : SITE_PATHS;
    for (const path of paths) {
      frontier.push({ kind: kindForPath(path), url: new URL(path, base).toString() });
    }
  } else {
    options.warnings.push("No website or domain recorded, so the company site could not be read.");
    await options.emit({
      section: "company",
      stage: "crawl",
      status: "warning",
      label: "No website or domain recorded — skipping the site crawl",
    });
  }

  let followed = 0;

  async function fetchInto(candidate: { kind: string; url: string; via?: string }) {
    const key = keyOf(candidate.url);
    if (seen.has(key) || pages.length >= MAX_SOURCES) return null;
    seen.add(key);

    let page: Awaited<ReturnType<typeof provider.fetchPage>>;
    try {
      page = await provider.fetchPage(candidate.url);
    } catch (error) {
      options.warnings.push(`Could not read ${candidate.url}: ${messageOf(error)}`);
      return null;
    }
    if (!page?.text?.trim()) return null;

    pages.push({
      kind: candidate.kind,
      url: candidate.url,
      title: page.title || candidate.url,
      text: page.text,
    });
    await options.emit({
      section: sectionForKind(candidate.kind),
      stage: `read:${key}`,
      status: "done",
      label: `Read ${page.title || candidate.url}`,
      detail: candidate.via ? `${candidate.url} — via ${candidate.via}` : candidate.url,
    });
    return page;
  }

  while (frontier.length && pages.length < MAX_SOURCES) {
    const candidate = frontier.shift()!;
    const page = await fetchInto(candidate);

    // Follow the page's own navigation the way a visitor would: people links
    // jump the queue, company links go to the back.
    if (page?.links?.length && host && followed < MAX_FOLLOWED_LINKS) {
      const scored = page.links
        .map((link) => ({ link, score: scoreLink(link, host) }))
        .filter(({ link, score }) => score > 0 && !seen.has(keyOf(link.url)))
        .sort((a, b) => b.score - a.score);

      for (const { link, score } of scored) {
        if (followed >= MAX_FOLLOWED_LINKS) break;
        followed += 1;
        const entry = {
          kind: kindForPath(`${link.label} ${new URL(link.url).pathname}`),
          url: link.url,
          via: `“${link.label || "link"}” on ${candidate.url}`,
        };
        if (score >= 2) frontier.unshift(entry);
        else frontier.push(entry);
        await options.emit({
          section: sectionForKind(entry.kind),
          stage: `follow:${keyOf(link.url)}`,
          status: "done",
          label: `Following the “${link.label || new URL(link.url).pathname}” link`,
          detail: link.url,
        });
      }
    }
  }

  /* --------------------------------- 2. searches a human would run next */
  try {
    const plan = await planSearches(options, pages);
    for (const entry of plan) {
      if (pages.length >= MAX_SOURCES) break;

      let results: Awaited<ReturnType<typeof provider.search>> = [];
      try {
        results = await provider.search(entry.query, RESULTS_PER_QUERY);
      } catch (error) {
        options.warnings.push(`Search failed: ${messageOf(error)}`);
      }

      await options.emit({
        section: entry.goal,
        stage: `search:${entry.query}`,
        status: results.length ? "done" : "warning",
        label: `Searched “${entry.query}”`,
        detail: [
          entry.reason,
          results.length
            ? `${results.length} results: ${results.map((r) => r.title).slice(0, 3).join(" · ")}`
            : "no results",
        ].join(" — "),
      });

      let fetched = 0;
      for (const result of results) {
        if (fetched >= FETCHES_PER_QUERY || pages.length >= MAX_SOURCES) break;
        const page = await fetchInto({
          kind: kindForPath(result.url),
          url: result.url,
          via: `search “${entry.query}”`,
        });
        if (page) fetched += 1;
      }
    }
  } catch (error) {
    // A dead planner degrades to the site crawl; it must not sink the run.
    options.warnings.push(`Search planning failed: ${messageOf(error)}`);
    await options.emit({
      section: "company",
      stage: "searchplan",
      status: "warning",
      label: "Search planning failed",
      detail: messageOf(error),
    });
  }

  return pages;
}

/** Asks the planner agent for queries; logs the plan before running it. */
async function planSearches(options: CrawlOptions, pages: FetchedPage[]) {
  const provider = getSearchProvider();
  // No vendor key → `search()` answers nothing; don't spend a model call
  // planning searches that cannot run. Mock always "has" search.
  if (provider.name === "http" && !env().SEARCH_API_KEY) {
    await options.emit({
      section: "company",
      stage: "searchplan",
      status: "warning",
      label: "Web search is not configured (SEARCH_API_KEY) — using the site crawl only",
    });
    return [];
  }

  await options.emit({
    section: "company",
    stage: "searchplan",
    status: "started",
    label: "Planning what to search for, like a human researcher would",
  });

  const planned = await aiService().run({
    agent: "searchplan",
    userId: options.userId,
    leadId: options.leadId,
    schema: searchPlanSchema,
    request: buildSearchPlanRequest({
      company: options.company,
      alreadyRead: pages.map((page) => page.title || page.url),
      maxQueries: MAX_SEARCH_QUERIES,
    }),
  });

  const plan = normaliseSearchPlan(planned.data, MAX_SEARCH_QUERIES);
  await options.emit({
    section: "company",
    stage: "searchplan",
    status: "done",
    label: `Planned ${plan.queries.length} search${plan.queries.length === 1 ? "" : "es"}`,
    detail: plan.queries.map((q) => `“${q.query}”`).join(" · ") || undefined,
  });
  return plan.queries;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
