import { ok, route } from "~~/server/lib/api";
import { env } from "~~/server/lib/env";
import type { ProviderStatuses } from "~~/shared/settings/providers";

/**
 * `providerStatuses()` from `src/app/(app)/settings/providers.ts`.
 *
 * It was a `server-only` module a server component called directly; a Nuxt page
 * cannot import it (it reads `env()`), so it is exposed as an endpoint instead.
 * The strings and the `isMock` logic are unchanged.
 */
export default route(async () => {
  const config = env();

  const statuses: ProviderStatuses = {
    ai: {
      title: "AI provider",
      active:
        config.AI_PROVIDER === "anthropic"
          ? `Anthropic (${config.ANTHROPIC_MODEL})`
          : "Mock",
      isMock: config.AI_PROVIDER === "mock",
      description:
        "Runs every agent. The mock provider returns deterministic structured output so the whole pipeline works without a key.",
      requirements: [
        { label: "ANTHROPIC_API_KEY", met: config.ANTHROPIC_API_KEY.length > 0 },
        { label: "ANTHROPIC_MODEL", met: config.ANTHROPIC_MODEL.length > 0 },
      ],
      switchTo: "set AI_PROVIDER=anthropic and restart.",
    },
    email: {
      title: "Email provider",
      active: config.EMAIL_PROVIDER === "gmail" ? "Gmail" : "Mock",
      isMock: config.EMAIL_PROVIDER === "mock",
      description:
        "Sends approved outreach and reads replies. The mock provider records sends locally and never contacts anyone.",
      requirements: [
        { label: "GOOGLE_CLIENT_ID", met: config.GOOGLE_CLIENT_ID.length > 0 },
        { label: "GOOGLE_CLIENT_SECRET", met: config.GOOGLE_CLIENT_SECRET.length > 0 },
        { label: "GOOGLE_REDIRECT_URI", met: config.GOOGLE_REDIRECT_URI.length > 0 },
      ],
      switchTo:
        "set EMAIL_PROVIDER=gmail, then connect the mailbox from Integrations.",
    },
    search: {
      title: "Search provider",
      active: config.SEARCH_PROVIDER === "http" ? "HTTP search API" : "Mock",
      isMock: config.SEARCH_PROVIDER === "mock",
      description:
        "Finds and fetches public pages for the research agent. Everything it returns is treated as untrusted data.",
      requirements: [
        { label: "SEARCH_API_KEY", met: config.SEARCH_API_KEY.length > 0 },
      ],
      switchTo: "set SEARCH_PROVIDER=http and restart.",
    },
  };

  return ok(statuses);
});
