/**
 * HTTP search provider — real page retrieval, used when SEARCH_PROVIDER=http.
 *
 * Fetching URLs on behalf of a signed-in user is a server-side request forgery
 * surface, so this is defensive by construction:
 *   - http/https only, no credentials in the URL;
 *   - the hostname is resolved and every resulting address is checked against
 *     the private, loopback, link-local, and reserved ranges;
 *   - redirects are followed manually, and each hop is re-validated;
 *   - a wall-clock timeout and a hard byte cap, so one page cannot hang or
 *     exhaust a worker.
 *
 * `search()` calls whichever vendor `SEARCH_VENDOR` names, and returns nothing
 * at all when no key is configured. That empty result is deliberate: a search
 * with no vendor must not fall back to guessed URLs, because a guessed URL in a
 * research report is an invented source, and an invented source is worse than a
 * missing one.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type {
  FetchedPageContent,
  SearchProvider,
  SearchResult,
} from "~~/server/lib/contracts";
import { env } from "~~/server/lib/env";
import { logApiCall } from "~~/server/lib/debug/apilog";
import { extractLinks, extractTitle, htmlToText } from "./text";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "AISalesEngine/0.1 (+research bot; contact the site owner if this is unwelcome)";

/** Vendor endpoints. Both answer JSON and both take the key in a header. */
const VENDORS = {
  brave: {
    url: "https://api.search.brave.com/res/v1/web/search",
    header: "x-subscription-token",
  },
  serper: {
    url: "https://google.serper.dev/search",
    header: "x-api-key",
  },
} as const;

export type SearchVendor = keyof typeof VENDORS;

export class HttpSearchProvider implements SearchProvider {
  readonly name = "http";

  async search(query: string, limit = 5): Promise<SearchResult[]> {
    const config = env();
    if (!config.SEARCH_API_KEY) return [];

    const sentAt = Date.now();
    try {
      const results = await runVendorSearch(
        config.SEARCH_VENDOR,
        config.SEARCH_API_KEY,
        query,
        limit,
      );
      logApiCall({
        provider: config.SEARCH_VENDOR,
        operation: "search",
        ok: true,
        status: 200,
        durationMs: Date.now() - sentAt,
        meta: { query, results: results.length },
      });
      return results;
    } catch (error) {
      logApiCall({
        provider: config.SEARCH_VENDOR,
        operation: "search",
        ok: false,
        status: statusOf(error),
        durationMs: Date.now() - sentAt,
        error: messageOf(error),
        meta: { query },
      });
      console.warn("[research] search failed", query, messageOf(error));
      return [];
    }
  }

  async fetchPage(url: string): Promise<FetchedPageContent | null> {
    const sentAt = Date.now();
    try {
      const page = await fetchReadable(url);
      logApiCall({
        provider: "fetch",
        operation: "fetchPage",
        url,
        ok: page !== null,
        durationMs: Date.now() - sentAt,
        error: page === null ? "no readable content (non-HTML, error status, or empty)" : undefined,
      });
      return page;
    } catch (error) {
      logApiCall({
        provider: "fetch",
        operation: "fetchPage",
        url,
        ok: false,
        durationMs: Date.now() - sentAt,
        error: messageOf(error),
      });
      console.warn("[research] fetch failed", url, messageOf(error));
      return null;
    }
  }
}

/**
 * One vendor call. Brave takes `q`/`count`, Serper takes a JSON POST — the
 * result shapes differ too, so each is parsed by its own function and both
 * converge on `SearchResult`.
 *
 * Vendor URLs are constants, never anything a caller supplied, so the SSRF
 * guard that `fetchPage` needs does not apply here. It very much does apply to
 * the URLs that come back, which is why every one of them goes through
 * `fetchReadable` before it is read.
 */
export async function runVendorSearch(
  vendor: SearchVendor,
  apiKey: string,
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const spec = VENDORS[vendor];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response =
      vendor === "brave"
        ? await fetch(`${spec.url}?${new URLSearchParams({ q: query, count: String(limit) })}`, {
            headers: { [spec.header]: apiKey, accept: "application/json" },
            signal: controller.signal,
          })
        : await fetch(spec.url, {
            method: "POST",
            headers: {
              [spec.header]: apiKey,
              accept: "application/json",
              "content-type": "application/json",
            },
            body: JSON.stringify({ q: query, num: limit }),
            signal: controller.signal,
          });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = response.status === 401 || response.status === 403 ? " (key rejected)" : "";
    // `status` rides along so the debug log records the real HTTP code.
    throw Object.assign(new Error(`${vendor} search returned ${response.status}${detail}`), {
      status: response.status,
    });
  }

  const payload: unknown = await response.json();
  const results = vendor === "brave" ? parseBrave(payload) : parseSerper(payload);
  return results.slice(0, limit);
}

/** Brave: `{ web: { results: [{ title, url, description }] } }`. */
export function parseBrave(payload: unknown): SearchResult[] {
  const results = (payload as { web?: { results?: unknown[] } })?.web?.results ?? [];
  return results.flatMap((entry) => {
    const row = entry as { title?: string; url?: string; description?: string };
    if (!row.url) return [];
    return [
      {
        title: row.title ?? row.url,
        url: row.url,
        snippet: stripTags(row.description ?? ""),
        source: "brave",
      },
    ];
  });
}

/** Serper: `{ organic: [{ title, link, snippet }] }`. */
export function parseSerper(payload: unknown): SearchResult[] {
  const results = (payload as { organic?: unknown[] })?.organic ?? [];
  return results.flatMap((entry) => {
    const row = entry as { title?: string; link?: string; snippet?: string };
    if (!row.link) return [];
    return [
      {
        title: row.title ?? row.link,
        url: row.link,
        snippet: row.snippet ?? "",
        source: "serper",
      },
    ];
  });
}

/** Brave marks query terms with `<strong>`; the snippet is read as plain text. */
function stripTags(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

export async function fetchReadable(startUrl: string): Promise<FetchedPageContent | null> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const target = await assertPublicUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(target.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,text/plain;q=0.9" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      current = new URL(location, target).toString();
      continue;
    }

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) return null;

    const body = await readCapped(response, MAX_BYTES);
    const isPlain = /text\/plain/i.test(contentType);
    const text = isPlain ? body.slice(0, 20_000) : htmlToText(body);
    if (!text.trim()) return null;

    return {
      title: extractTitle(body) ?? target.hostname,
      text,
      links: isPlain ? [] : extractLinks(body, target.toString()),
    };
  }

  return null;
}

/** Throws unless the URL is http(s) and resolves only to public addresses. */
export async function assertPublicUrl(value: string): Promise<URL> {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`unsupported protocol ${url.protocol}`);
  }
  if (url.username || url.password) throw new Error("credentials in URL are not allowed");

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) throw new Error(`blocked host ${hostname}`);

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new Error(`host resolves to a private address`);
  }

  return url;
}

export function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    host === "metadata.google.internal"
  );
}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) return isPrivateIpv6(address);

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 and 192.0.2.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIpv6(address: string): boolean {
  const host = address.toLowerCase().split("%")[0];
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(host)) return true; // unique local
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

async function readCapped(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("response too large");

  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total > maxBytes ? maxBytes : total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : null;
}
