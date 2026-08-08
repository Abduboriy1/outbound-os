/**
 * Anthropic provider. Opt in with AI_PROVIDER=anthropic; the mock stays the
 * default so the product runs with no keys.
 *
 * Three things this file is careful about:
 *  - The system parameter carries operator text only. Untrusted documents are
 *    rendered into the user turn by `renderUserContent` (plan §36).
 *  - Structured output is requested through `output_config.format`, and the
 *    reply is still parsed defensively — a schema request is not a guarantee.
 *  - One retry on unparseable output, as a follow-up user turn rather than a
 *    fresh call, so the model sees what it got wrong.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { AiProvider, AiRequest, AiResponse } from "~~/server/lib/contracts";
import { env } from "~~/server/lib/env";
import { renderUserContent } from "../prompt";

const DEFAULT_MAX_TOKENS = 8_000;
/** Non-streaming requests above this risk an SDK HTTP timeout. */
const MAX_TOKENS_CEILING = 16_000;

export class AnthropicProviderError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AnthropicProviderError";
  }
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(client?: Anthropic) {
    const config = env();
    this.model = config.ANTHROPIC_MODEL;
    if (client) {
      this.client = client;
    } else {
      if (!config.ANTHROPIC_API_KEY) {
        throw new AnthropicProviderError(
          "AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY. Set it, or switch AI_PROVIDER back to mock.",
        );
      }
      this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }
  }

  async complete<T = unknown>(request: AiRequest): Promise<AiResponse<T>> {
    const startedAt = Date.now();
    const userContent = renderUserContent(request);
    const maxTokens = Math.min(request.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_TOKENS_CEILING);

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];

    let promptTokens = 0;
    let completionTokens = 0;
    let lastText = "";
    let lastError: unknown;

    // One retry: the second attempt shows the model its own invalid output.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let message: Anthropic.Message;
      try {
        message = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          system: request.system,
          messages,
          // Sampling parameters are rejected by current models; behaviour is
          // steered through the prompt instead.
          output_config: {
            format: { type: "json_schema", schema: request.responseSchema },
          },
        });
      } catch (error) {
        throw new AnthropicProviderError(describeSdkError(error), error);
      }

      promptTokens += message.usage?.input_tokens ?? 0;
      completionTokens += message.usage?.output_tokens ?? 0;

      if (message.stop_reason === "refusal") {
        throw new AnthropicProviderError(
          `Model declined the request (${message.stop_details?.category ?? "unspecified"}).`,
        );
      }

      lastText = textOf(message);

      if (message.stop_reason === "max_tokens") {
        lastError = new Error("Response hit the max_tokens ceiling and is incomplete.");
      } else {
        try {
          return {
            data: parseJson(lastText) as T,
            rawText: lastText,
            model: message.model ?? this.model,
            provider: this.name,
            promptTokens,
            completionTokens,
            latencyMs: Date.now() - startedAt,
          };
        } catch (error) {
          lastError = error;
        }
      }

      messages.push(
        { role: "assistant", content: lastText || "(empty response)" },
        {
          role: "user",
          content: [
            `That reply could not be used: ${(lastError as Error)?.message ?? "unparseable output"}.`,
            "Reply again with a single JSON object matching the requested schema.",
            "No prose, no markdown fences, no trailing commentary.",
          ].join(" "),
        },
      );
    }

    throw new AnthropicProviderError(
      `Model did not return valid JSON after a retry: ${(lastError as Error)?.message ?? "unknown"}`,
      lastError,
    );
  }
}

function textOf(message: Anthropic.Message) {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

/**
 * Tolerates the two failure shapes seen in practice: a fenced code block, and
 * prose wrapped around the object. Anything else is a genuine failure.
 */
export function parseJson(text: string): unknown {
  if (!text) throw new Error("empty response");

  const candidates = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("response was not valid JSON");
}

function describeSdkError(error: unknown) {
  if (error instanceof Anthropic.RateLimitError) return "Anthropic rate limit reached.";
  if (error instanceof Anthropic.AuthenticationError) return "Anthropic API key rejected.";
  if (error instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API.";
  if (error instanceof Anthropic.APIError) {
    return `Anthropic API error ${error.status ?? ""}: ${error.message}`.trim();
  }
  return error instanceof Error ? error.message : "Unknown Anthropic SDK error";
}
