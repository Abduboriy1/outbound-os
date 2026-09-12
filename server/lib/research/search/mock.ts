/**
 * Mock search provider — the default (CONVENTIONS: mock runs with no keys).
 *
 * It returns a small set of plausible pages for whatever domain it is asked
 * about, so the research pipeline, the signal rules, the scores, and the UI can
 * all be exercised end to end offline. Every page is explicitly labelled as
 * sample data in its title and in the first line of its body, so nobody can
 * mistake it for something that was actually retrieved.
 *
 * The variation is seeded from the domain, so a given company always produces
 * the same pages — demos and tests stay stable.
 */

import type {
  FetchedPageContent,
  SearchProvider,
  SearchResult,
} from "~~/server/lib/contracts";

export const SAMPLE_BANNER =
  "[SAMPLE DATA] Generated locally by the mock search provider. This text was not retrieved from the internet. Configure SEARCH_PROVIDER=http to fetch real pages.";

type PageKind = "homepage" | "about" | "services" | "careers" | "news";

const PATHS: Record<PageKind, string> = {
  homepage: "/",
  about: "/about",
  services: "/services",
  careers: "/careers",
  news: "/news",
};

/** Sentences that carry a pain signal. Two are chosen per company, by hash. */
const OPERATIONS_LINES = [
  "The operations team currently produces the weekly management report by consolidating several Excel workbooks by hand.",
  "Order data is exported to CSV from the warehouse system and re-keyed into the finance package each week.",
  "Invoices are reconciled manually against supplier statements at the end of every month.",
  "Customer records are maintained across multiple systems that are not integrated, so the same details are entered twice.",
  "Much of the reporting still depends on a legacy internal system that is approaching end of life.",
  "The team relies on a set of spreadsheets and workarounds to keep the despatch schedule up to date.",
];

const HIRING_LINES = [
  "We are hiring an Operations Coordinator to own weekly reporting, data entry, and reconciliation across our systems.",
  "We are hiring a Data Administrator to maintain records across our order and finance platforms.",
  "Now hiring an Operations Manager to remove bottlenecks from our back-office processes.",
];

const GROWTH_LINES = [
  "It has been a record year: we grew by more than a third and opened a new depot.",
  "Following rapid growth, we are expanding into two new markets this year.",
  "We recently completed the acquisition of a smaller regional operator.",
];

export class MockSearchProvider implements SearchProvider {
  readonly name = "mock";

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const domain = domainFromQuery(query);
    const company = companyName(domain);
    const kinds: PageKind[] = ["homepage", "about", "services", "careers", "news"];
    return kinds.slice(0, limit).map((kind) => {
      const url = `https://${domain}${PATHS[kind]}`;
      return {
        title: `${company} — ${titleFor(kind)} (sample data)`,
        url,
        snippet: firstLine(body(kind, domain)),
        source: "mock-search",
      };
    });
  }

  async fetchPage(url: string): Promise<FetchedPageContent | null> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const kind = kindFromPath(parsed.pathname);
    if (!kind) return null;
    const company = companyName(parsed.hostname);
    return {
      title: `${company} — ${titleFor(kind)} (sample data)`,
      text: `${SAMPLE_BANNER}\n\n${body(kind, parsed.hostname)}`,
      // The homepage links to the other sample pages, like real site nav, so
      // the crawler's link-following path is exercised in mock mode too.
      links:
        kind === "homepage"
          ? Object.entries(PATHS)
              .filter(([k]) => k !== "homepage")
              .map(([k, path]) => ({
                url: `https://${parsed.hostname}${path}`,
                label: titleFor(k as PageKind),
              }))
          : [],
    };
  }
}

/** The paths the pipeline should try for a company website. */
export const SAMPLE_PATHS = Object.values(PATHS);

function kindFromPath(pathname: string): PageKind | null {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const entry = Object.entries(PATHS).find(([, path]) => path === clean);
  if (entry) return entry[0] as PageKind;
  if (/career|job|vacanc|hiring/i.test(clean)) return "careers";
  if (/about|team|company/i.test(clean)) return "about";
  if (/news|blog|press/i.test(clean)) return "news";
  if (/service|product|solution/i.test(clean)) return "services";
  return "homepage";
}

function titleFor(kind: PageKind) {
  return {
    homepage: "Home",
    about: "About us",
    services: "Services",
    careers: "Careers",
    news: "News",
  }[kind];
}

function body(kind: PageKind, domain: string) {
  const company = companyName(domain);
  const seed = hash(domain);
  const ops = pick(OPERATIONS_LINES, seed, 2);
  const hiring = pick(HIRING_LINES, seed + 1, 1)[0];
  const growth = pick(GROWTH_LINES, seed + 2, 1)[0];

  switch (kind) {
    case "homepage":
      return [
        `${company}`,
        "",
        `${company} supplies and services customers across the region. We have been trading for over fifteen years and work with clients who need things done on time and recorded accurately.`,
        growth,
        "",
        "What we do",
        "- Supply and distribution",
        "- Scheduled servicing and maintenance",
        "- Account management for long-term customers",
      ].join("\n");
    case "about":
      return [
        `About ${company}`,
        "",
        `${company} is an owner-managed business. The operations team handles scheduling, despatch, and customer administration from a single site.`,
        ops[0],
        growth,
      ].join("\n");
    case "services":
      return [
        `Services from ${company}`,
        "",
        "- Contract supply with agreed service levels",
        "- Planned maintenance visits",
        "- Reporting for account customers",
        "",
        `Reporting for account customers is produced monthly. ${ops[1] ?? ops[0]}`,
      ].join("\n");
    case "careers":
      return [
        `Careers at ${company}`,
        "",
        hiring,
        "",
        "The role",
        ops[0],
        ops[1] ?? "",
        "You will be comfortable with Excel and confident chasing information across the business.",
        "",
        "Apply now with a short covering note.",
      ]
        .filter(Boolean)
        .join("\n");
    case "news":
      return [
        `News from ${company}`,
        "",
        growth,
        `As the business grows, the administrative load has grown with it. ${ops[0]}`,
      ].join("\n");
  }
}

function firstLine(text: string) {
  return text.split("\n").filter(Boolean).slice(0, 3).join(" ").slice(0, 200);
}

export function companyName(domain: string) {
  const base = domain.replace(/^www\./, "").split(".")[0] ?? "Example";
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function domainFromQuery(query: string) {
  const match = query.match(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
  return (match?.[1] ?? "example.com").toLowerCase();
}

function pick<T>(values: T[], seed: number, count: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < count && i < values.length; i += 1) {
    out.push(values[(seed + i * 7) % values.length]);
  }
  return out;
}

function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
