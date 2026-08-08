import type { SearchProvider } from "~~/server/lib/contracts";
import { env } from "~~/server/lib/env";
import { MockSearchProvider } from "./mock";
import { HttpSearchProvider } from "./http";

let cached: SearchProvider | null = null;

/** Selects the search provider from `SEARCH_PROVIDER` (plan §35). */
export function getSearchProvider(): SearchProvider {
  if (cached) return cached;
  cached = env().SEARCH_PROVIDER === "http" ? new HttpSearchProvider() : new MockSearchProvider();
  return cached;
}

/** Test hook. */
export function resetSearchProvider(provider?: SearchProvider) {
  cached = provider ?? null;
}

export { MockSearchProvider, SAMPLE_PATHS } from "./mock";
export { HttpSearchProvider, assertPublicUrl, isPrivateAddress } from "./http";
export { htmlToText, extractTitle } from "./text";
