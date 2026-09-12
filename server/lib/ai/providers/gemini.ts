/**
 * Google Gemini provider. Opt in with AI_PROVIDER=gemini; the mock stays the
 * default so the product runs with no keys.
 *
 * It mirrors the Anthropic provider deliberately — same boundaries, same
 * defensiveness — because a second provider that behaves differently is a
 * second set of bugs:
 *  - `systemInstruction` carries operator text only. Untrusted documents are
 *    rendered into the user turn by `renderUserContent` (plan §36).
 *  - Structured output is requested through `responseJsonSchema`, and the reply
 *    is still parsed defensively — a schema request is not a guarantee.
 *  - One retry on unparseable output, as a follow-up user turn rather than a
 *    fresh call, so the model sees what it got wrong.
 */

import { ApiError, GoogleGenAI, type Content, type GenerateContentResponse } from "@google/genai";
import type {
  AiProvider,
  AiRequest,
  AiResponse,
  GroundedCitation,
  GroundedRequest,
  GroundedResponse,
  GroundedSearchProvider,
} from "~~/server/lib/contracts";
import { env } from "~~/server/lib/env";
import { logApiCall } from "~~/server/lib/debug/apilog";
import { getGeminiLimiter, unlimited, type RateLimiter } from "../ratelimit";
import { renderUserContent } from "../prompt";
import { parseJson, retryInstruction } from "./json";

const DEFAULT_MAX_TOKENS = 8_000;
/** Non-streaming requests above this risk an SDK HTTP timeout. */
const MAX_TOKENS_CEILING = 16_000;

/**
 * Statuses that mean "the service is briefly unhappy", not "this request is
 * wrong": 429 rate limits, 500 INTERNAL, and the 503 UNAVAILABLE that Gemini
 * returns when a model is overloaded. Anything else fails immediately.
 */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 503]);
/**
 * Grounded calls exclude 429: an unbilled key is refused with the same
 * RESOURCE_EXHAUSTED as a real rate limit (see `describeGroundedError`), and
 * retrying a quota that will never refill only delays the useful error.
 */
const RETRYABLE_GROUNDED_STATUSES: ReadonlySet<number> = new Set([500, 503]);
/** Backoff between transient-failure retries. The caller is a waiting user, so it stays short. */
const RETRY_DELAYS_MS = [1_000, 3_000];
/**
 * 429 gets its own, longer schedule: the request already went through the rate
 * limiter, so a 429 means the real quota is smaller than GEMINI_RPM (or shared
 * with another process) and a 1–3s retry would just burn another request.
 * Google usually names the wait in the error (`retryDelay`); when present that
 * wins over this schedule.
 */
const RATE_LIMIT_DELAYS_MS = [5_000, 15_000, 30_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Finish reasons that mean the model refused rather than failed. */
const REFUSAL_REASONS = new Set([
  "SAFETY",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "RECITATION",
  "IMAGE_SAFETY",
]);

export class GeminiProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GeminiProviderError";
  }
}

/** The slice of the SDK this provider uses — lets tests inject a fake. */
export type GeminiClient = {
  models: {
    generateContent(params: {
      model: string;
      contents: Content[];
      config?: Record<string, unknown>;
    }): Promise<GenerateContentResponse>;
  };
};

export class GeminiAiProvider implements AiProvider, GroundedSearchProvider {
  readonly name = "gemini";
  readonly model: string;
  private readonly client: GeminiClient;
  private readonly limiter: Pick<RateLimiter, "acquire" | "penalize">;

  constructor(client?: GeminiClient, limiter?: Pick<RateLimiter, "acquire" | "penalize">) {
    const config = env();
    this.model = config.GEMINI_MODEL;
    // An injected client is a test double; those get no pacing unless the test
    // injects a limiter too. The real SDK always goes through the shared one.
    this.limiter = limiter ?? (client ? unlimited : getGeminiLimiter());
    if (client) {
      this.client = client;
    } else {
      if (!config.GEMINI_API_KEY) {
        throw new GeminiProviderError(
          "AI_PROVIDER=gemini requires GEMINI_API_KEY. Set it, or switch AI_PROVIDER back to mock.",
        );
      }
      this.client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    }
  }

  /**
   * One SDK call with backoff on transient failures. Distinct from the
   * invalid-JSON retry loop in `complete()`: that one re-prompts the model with
   * its own bad output, this one repeats the identical request because the
   * service, not the model, dropped it.
   *
   * Every attempt waits its turn at the shared rate limiter first, and every
   * attempt — success or failure — writes a debug_logs row.
   */
  private async generate(
    operation: string,
    params: Parameters<GeminiClient["models"]["generateContent"]>[0],
    retryOn: ReadonlySet<number>,
  ): Promise<GenerateContentResponse> {
    for (let retry = 0; ; retry += 1) {
      await this.limiter.acquire();
      const sentAt = Date.now();
      try {
        const response = await this.client.models.generateContent(params);
        logApiCall({
          provider: this.name,
          operation,
          ok: true,
          status: 200,
          durationMs: Date.now() - sentAt,
          attempt: retry + 1,
          meta: {
            model: params.model,
            promptTokens: response.usageMetadata?.promptTokenCount,
            completionTokens: response.usageMetadata?.candidatesTokenCount,
          },
        });
        return response;
      } catch (error) {
        const status = error instanceof ApiError ? error.status : null;
        logApiCall({
          provider: this.name,
          operation,
          ok: false,
          status,
          durationMs: Date.now() - sentAt,
          attempt: retry + 1,
          error: error instanceof Error ? error.message : String(error),
          meta: { model: params.model },
        });

        const delays = status === 429 ? RATE_LIMIT_DELAYS_MS : RETRY_DELAYS_MS;
        if (retry >= delays.length || status === null || !retryOn.has(status)) {
          throw error;
        }

        let delay = delays[retry]!;
        if (status === 429) {
          // Google names the wait in the 429 body; honour it and hold the
          // whole queue back so waiting requests don't burn quota meanwhile.
          const serverDelay = retryDelayMsOf(error);
          if (serverDelay !== null) delay = serverDelay;
          this.limiter.penalize(delay);
        }
        await sleep(delay);
      }
    }
  }

  async complete<T = unknown>(request: AiRequest): Promise<AiResponse<T>> {
    const startedAt = Date.now();
    const userContent = renderUserContent(request);
    const maxTokens = Math.min(request.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING);

    const contents: Content[] = [{ role: "user", parts: [{ text: userContent }] }];

    let promptTokens = 0;
    let completionTokens = 0;
    let lastText = "";
    let lastError: unknown;
    let responseModel = this.model;

    // One retry: the second attempt shows the model its own invalid output.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: GenerateContentResponse;
      try {
        response = await this.generate(
          `complete:${request.agent}`,
          {
            model: this.model,
            contents,
            config: {
              systemInstruction: request.system,
              maxOutputTokens: maxTokens,
              responseMimeType: "application/json",
              responseJsonSchema: toGeminiSchema(request.responseSchema),
            },
          },
          RETRYABLE_STATUSES,
        );
      } catch (error) {
        throw new GeminiProviderError(describeSdkError(error), error);
      }

      promptTokens += response.usageMetadata?.promptTokenCount ?? 0;
      completionTokens += response.usageMetadata?.candidatesTokenCount ?? 0;
      responseModel = response.modelVersion ?? this.model;

      const blockReason = response.promptFeedback?.blockReason;
      if (blockReason) {
        throw new GeminiProviderError(`Prompt was blocked by Gemini (${blockReason}).`);
      }

      const finishReason = response.candidates?.[0]?.finishReason;
      if (finishReason && REFUSAL_REASONS.has(finishReason)) {
        throw new GeminiProviderError(`Model declined the request (${finishReason}).`);
      }

      lastText = textOf(response);

      if (finishReason === "MAX_TOKENS") {
        lastError = new Error("Response hit the max_tokens ceiling and is incomplete.");
      } else {
        try {
          return {
            data: parseJson(lastText) as T,
            rawText: lastText,
            model: responseModel,
            provider: this.name,
            promptTokens,
            completionTokens,
            latencyMs: Date.now() - startedAt,
          };
        } catch (error) {
          lastError = error;
        }
      }

      contents.push(
        { role: "model", parts: [{ text: lastText || "(empty response)" }] },
        {
          role: "user",
          parts: [
            { text: retryInstruction((lastError as Error)?.message ?? "unparseable output") },
          ],
        },
      );
    }

    throw new GeminiProviderError(
      `Model did not return valid JSON after a retry: ${(lastError as Error)?.message ?? "unknown"}`,
      lastError,
    );
  }

  /**
   * One grounded call: Gemini runs its own Google searches and answers from
   * what it read, reporting the sources back in `groundingMetadata`.
   *
   * There is no `responseJsonSchema` here on purpose — the Gemini API rejects
   * structured output combined with the search tool, so this returns prose and
   * the caller makes a second, ordinary `complete()` call to structure it. That
   * split is also the safer shape: the searched text arrives as an untrusted
   * document rather than as something the model was told to trust.
   */
  async searchGrounded(request: GroundedRequest): Promise<GroundedResponse> {
    const startedAt = Date.now();
    const maxTokens = Math.min(request.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING);

    let response: GenerateContentResponse;
    try {
      response = await this.generate(
        "searchGrounded",
        {
          model: this.model,
          contents: [{ role: "user", parts: [{ text: request.instruction }] }],
          config: {
            systemInstruction: request.system,
            maxOutputTokens: maxTokens,
            tools: [{ googleSearch: {} }],
          },
        },
        RETRYABLE_GROUNDED_STATUSES,
      );
    } catch (error) {
      throw new GeminiProviderError(describeGroundedError(error), error);
    }

    const blockReason = response.promptFeedback?.blockReason;
    if (blockReason) {
      throw new GeminiProviderError(`Search prompt was blocked by Gemini (${blockReason}).`);
    }

    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && REFUSAL_REASONS.has(candidate.finishReason)) {
      throw new GeminiProviderError(`Model declined the search (${candidate.finishReason}).`);
    }

    const grounding = candidate?.groundingMetadata;
    const citations: GroundedCitation[] = (grounding?.groundingChunks ?? [])
      .map((chunk) => chunk.web)
      .filter((web): web is NonNullable<typeof web> => Boolean(web?.uri))
      .map((web) => ({
        url: web.uri!,
        title: web.title,
        // The Gemini API does not populate `domain`, and `uri` is a
        // vertexaisearch redirect, so the publisher hostname usually has to be
        // recovered from the title. `citationDomain` handles all three cases.
        domain: citationDomain(web.domain, web.title, web.uri),
      }));

    const text = textOf(response);
    if (!text && citations.length === 0) {
      throw new GeminiProviderError("Grounded search returned no text and no sources.");
    }

    return {
      text,
      citations,
      queries: grounding?.webSearchQueries ?? [],
      model: response.modelVersion ?? this.model,
      provider: this.name,
      promptTokens: response.usageMetadata?.promptTokenCount,
      completionTokens: response.usageMetadata?.candidatesTokenCount,
      latencyMs: Date.now() - startedAt,
    };
  }
}

/** Hosts that are the grounding transport rather than a publisher. */
const REDIRECT_HOSTS = [/(^|\.)vertexaisearch\.cloud\.google\.com$/i, /(^|\.)googleusercontent\.com$/i];

/**
 * Recovers the hostname that actually published a cited page.
 *
 * Vertex AI's `domain` field is authoritative but is not populated on the
 * Gemini API, where `title` carries the bare hostname instead ("acme.co.uk")
 * and `uri` is only a redirect. Order matters: a redirect host must never be
 * returned, because verification treats a domain match as evidence a company is
 * real, and every candidate would match the redirect.
 */
export function citationDomain(
  domain?: string,
  title?: string,
  uri?: string,
): string | undefined {
  const clean = (value?: string) => {
    const host = value?.trim().toLowerCase().replace(/^www\./, "");
    if (!host || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return undefined;
    return REDIRECT_HOSTS.some((pattern) => pattern.test(host)) ? undefined : host;
  };

  if (clean(domain)) return clean(domain);
  if (clean(title)) return clean(title);
  try {
    return uri ? clean(new URL(uri).hostname) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * `response.text` drops thought parts already, but it also logs a warning and
 * returns undefined in edge cases, so the parts are read directly.
 */
function textOf(response: GenerateContentResponse) {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
}

/**
 * Gemini's `responseJsonSchema` takes JSON Schema, but rejects a few members
 * that `jsonSchemaOf` emits for strict structured output elsewhere.
 * `additionalProperties` is the one that matters — Zod 4 sets it on every
 * object — so unsupported keys are stripped recursively rather than leaving
 * every agent schema to fail with a 400.
 */
export function toGeminiSchema(schema: Record<string, unknown>): unknown {
  const UNSUPPORTED = new Set(["additionalProperties", "$schema", "unevaluatedProperties"]);

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED.has(key)) continue;
      out[key] = walk(value);
    }
    return out;
  };

  return walk(schema);
}

/**
 * A 429 on a grounded call almost never means what a 429 usually means.
 *
 * Google Search grounding is billed separately from tokens, and an unbilled key
 * is refused with the same RESOURCE_EXHAUSTED as a genuine rate limit — while
 * ordinary generation on that key keeps working. Reporting it as "rate limit
 * reached" sends people off to wait for a quota that will never refill, so the
 * grounded path says what is actually wrong.
 */
function describeGroundedError(error: unknown) {
  if (error instanceof ApiError && error.status === 429) {
    return (
      "Gemini refused the web search (quota exhausted). Google Search grounding is billed " +
      "separately from tokens and is not part of the free tier, so this is usually a key with " +
      "no billing account rather than a limit that will reset — ordinary generation on the same " +
      "key keeps working. Enable billing on the key's Google Cloud project, or set " +
      "AI_PROVIDER=mock to work with sample companies."
    );
  }
  return describeSdkError(error);
}

function describeSdkError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Gemini rate limit reached.";
    if (error.status === 401 || error.status === 403) return "Gemini API key rejected.";
    if (error.status === 404) {
      return `Gemini model not found — check GEMINI_MODEL (currently "${env().GEMINI_MODEL}").`;
    }
    return `Gemini API error ${error.status}: ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : "Unknown Gemini SDK error";
}

/**
 * Google's 429 body carries a RetryInfo detail like `"retryDelay":"22s"`
 * embedded in the error message JSON. Null when absent or unparsable.
 */
export function retryDelayMsOf(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1_000) : null;
}
