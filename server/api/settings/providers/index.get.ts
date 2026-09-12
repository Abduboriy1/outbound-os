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

  const anthropicRequirements = [
    { label: "ANTHROPIC_API_KEY", met: config.ANTHROPIC_API_KEY.length > 0 },
    { label: "ANTHROPIC_MODEL", met: config.ANTHROPIC_MODEL.length > 0 },
  ];
  const geminiRequirements = [
    { label: "GEMINI_API_KEY", met: config.GEMINI_API_KEY.length > 0 },
    { label: "GEMINI_MODEL", met: config.GEMINI_MODEL.length > 0 },
  ];

  const aiActive = {
    mock: "Mock",
    anthropic: `Anthropic (${config.ANTHROPIC_MODEL})`,
    gemini: `Gemini (${config.GEMINI_MODEL})`,
  }[config.AI_PROVIDER];

  const statuses: ProviderStatuses = {
    ai: {
      title: "AI provider",
      active: aiActive,
      isMock: config.AI_PROVIDER === "mock",
      description:
        "Runs every agent. The mock provider returns deterministic structured output so the whole pipeline works without a key.",
      // On mock, both key sets are listed so the operator can see which real
      // provider is already configured; otherwise only the one in use.
      requirements:
        config.AI_PROVIDER === "anthropic"
          ? anthropicRequirements
          : config.AI_PROVIDER === "gemini"
            ? geminiRequirements
            : [...anthropicRequirements, ...geminiRequirements],
      switchTo: "set AI_PROVIDER=anthropic or AI_PROVIDER=gemini and restart.",
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
      active:
        config.SEARCH_PROVIDER === "http"
          ? config.SEARCH_API_KEY
            ? `HTTP (${config.SEARCH_VENDOR} search)`
            : "HTTP (page fetching only — no search key)"
          : "Mock",
      isMock: config.SEARCH_PROVIDER === "mock",
      description:
        "Finds and fetches public pages for the research agent and the AI lead finder. Everything it returns is treated as untrusted data. Without a key it can still fetch a known URL, but it cannot search — so the lead finder falls back to provider-side grounding.",
      requirements: [
        { label: "SEARCH_API_KEY", met: config.SEARCH_API_KEY.length > 0 },
        { label: "SEARCH_VENDOR (brave or serper)", met: config.SEARCH_VENDOR.length > 0 },
      ],
      switchTo: "set SEARCH_PROVIDER=http with a SEARCH_API_KEY, and restart.",
    },
  };

  return ok(statuses);
});
