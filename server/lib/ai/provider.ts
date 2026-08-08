import type { AiProvider } from "~~/server/lib/contracts";
import { env } from "~~/server/lib/env";
import { MockAiProvider } from "./providers/mock";
import { AnthropicAiProvider } from "./providers/anthropic";
// Side-effect import: registers the hand-written mock generators. Without it
// those agents fall back to the schema synthesiser, which emits field-shaped
// filler rather than anything a person would recognise as reply analysis.
import "./mocks";

let cached: AiProvider | null = null;

/**
 * Selects the AI provider from `AI_PROVIDER` (plan §35). Mock is the default,
 * so a fresh checkout with no keys still runs the whole pipeline.
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;
  cached = env().AI_PROVIDER === "anthropic" ? new AnthropicAiProvider() : new MockAiProvider();
  return cached;
}

/** Test/worker hook — forces the next getAiProvider() to re-read the config. */
export function resetAiProvider(provider?: AiProvider) {
  cached = provider ?? null;
}
