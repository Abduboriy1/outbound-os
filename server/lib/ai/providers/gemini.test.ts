import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type Content, type GenerateContentResponse } from "@google/genai";
import type { AiRequest } from "~~/server/lib/contracts";
import {
  citationDomain,
  GeminiAiProvider,
  GeminiProviderError,
  retryDelayMsOf,
  toGeminiSchema,
  type GeminiClient,
} from "./gemini";
import { RateLimiter } from "../ratelimit";

const request: AiRequest = {
  agent: "research",
  system: "You are a research agent.",
  instruction: "Summarise the company.",
  data: [{ label: "Acme — About", url: "https://acme.example", content: "Acme makes widgets." }],
  responseSchema: { type: "object", properties: { summary: { type: "string" } } },
};

type Call = { model: string; contents: Content[]; config?: Record<string, unknown> };

/** Replays canned responses in order and records what it was asked. An Error entry rejects. */
function fakeClient(...replies: (Partial<GenerateContentResponse> | Error)[]) {
  const calls: Call[] = [];
  const client: GeminiClient = {
    models: {
      generateContent(params) {
        calls.push(params);
        const reply = replies[calls.length - 1];
        if (!reply) throw new Error("fake client ran out of replies");
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve(reply as GenerateContentResponse);
      },
    },
  };
  return { client, calls };
}

function textReply(text: string, extra: Partial<GenerateContentResponse> = {}) {
  return {
    candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
    modelVersion: "gemini-2.5-pro",
    ...extra,
  } as Partial<GenerateContentResponse>;
}

describe("GeminiAiProvider", () => {
  it("parses structured output and reports usage", async () => {
    const { client, calls } = fakeClient(textReply('{"summary":"Acme makes widgets."}'));
    const response = await new GeminiAiProvider(client).complete<{ summary: string }>(request);

    expect(response.data.summary).toBe("Acme makes widgets.");
    expect(response.provider).toBe("gemini");
    expect(response.model).toBe("gemini-2.5-pro");
    expect(response.promptTokens).toBe(10);
    expect(response.completionTokens).toBe(5);
    expect(calls).toHaveLength(1);
  });

  it("keeps untrusted documents out of the system instruction", async () => {
    const { client, calls } = fakeClient(textReply('{"summary":"ok"}'));
    await new GeminiAiProvider(client).complete(request);

    expect(calls[0]!.config?.systemInstruction).toBe(request.system);
    const userText = calls[0]!.contents[0]!.parts![0]!.text!;
    expect(userText).toContain("Acme makes widgets.");
    expect(calls[0]!.config?.responseMimeType).toBe("application/json");
  });

  it("retries once with the invalid reply in the transcript", async () => {
    const { client, calls } = fakeClient(
      textReply("Sure! Here is the summary."),
      textReply('{"summary":"Acme makes widgets."}'),
    );
    const response = await new GeminiAiProvider(client).complete<{ summary: string }>(request);

    expect(response.data.summary).toBe("Acme makes widgets.");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.contents).toHaveLength(3);
    expect(calls[1]!.contents[1]!.role).toBe("model");
    // Both attempts are billed.
    expect(response.promptTokens).toBe(20);
  });

  it("throws when the model refuses", async () => {
    const { client } = fakeClient(
      textReply("", { candidates: [{ finishReason: "SAFETY" }] } as Partial<GenerateContentResponse>),
    );
    await expect(new GeminiAiProvider(client).complete(request)).rejects.toBeInstanceOf(
      GeminiProviderError,
    );
  });

  it("throws after a failed retry rather than returning junk", async () => {
    const { client, calls } = fakeClient(textReply("not json"), textReply("still not json"));
    await expect(new GeminiAiProvider(client).complete(request)).rejects.toThrow(/valid JSON/);
    expect(calls).toHaveLength(2);
  });

  describe("transient API errors", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("retries an overloaded model and succeeds", async () => {
      vi.useFakeTimers();
      const { client, calls } = fakeClient(
        new ApiError({ message: "overloaded", status: 503 }),
        textReply('{"summary":"Acme makes widgets."}'),
      );

      const pending = new GeminiAiProvider(client).complete<{ summary: string }>(request);
      await vi.runAllTimersAsync();

      expect((await pending).data.summary).toBe("Acme makes widgets.");
      expect(calls).toHaveLength(2);
    });

    it("gives up once the backoff schedule is exhausted", async () => {
      vi.useFakeTimers();
      const { client, calls } = fakeClient(
        new ApiError({ message: "overloaded", status: 503 }),
        new ApiError({ message: "overloaded", status: 503 }),
        new ApiError({ message: "overloaded", status: 503 }),
      );

      const pending = new GeminiAiProvider(client).complete(request);
      const assertion = expect(pending).rejects.toThrow(/Gemini API error 503/);
      await vi.runAllTimersAsync();

      await assertion;
      expect(calls).toHaveLength(3);
    });

    it("does not retry a non-transient status", async () => {
      const { client, calls } = fakeClient(new ApiError({ message: "denied", status: 403 }));
      await expect(new GeminiAiProvider(client).complete(request)).rejects.toThrow(
        /API key rejected/,
      );
      expect(calls).toHaveLength(1);
    });

    it("retries a 429 and pushes the shared limiter back", async () => {
      vi.useFakeTimers();
      const { client, calls } = fakeClient(
        new ApiError({ message: 'rate limited {"retryDelay":"7s"}', status: 429 }),
        textReply('{"summary":"Acme makes widgets."}'),
      );
      const limiter = new RateLimiter(100, 60_000);
      const penalize = vi.spyOn(limiter, "penalize");

      const pending = new GeminiAiProvider(client, limiter).complete<{ summary: string }>(request);
      await vi.runAllTimersAsync();

      expect((await pending).data.summary).toBe("Acme makes widgets.");
      expect(calls).toHaveLength(2);
      // Server-sent retryDelay wins over the static backoff schedule.
      expect(penalize).toHaveBeenCalledWith(7_000);
    });

    it("names the model when Gemini answers 404", async () => {
      const { client } = fakeClient(new ApiError({ message: "not found", status: 404 }));
      await expect(new GeminiAiProvider(client).complete(request)).rejects.toThrow(
        /model not found/,
      );
    });
  });
});

describe("retryDelayMsOf", () => {
  it("parses the RetryInfo delay from the error message", () => {
    expect(retryDelayMsOf(new Error('429 {"retryDelay":"22s"}'))).toBe(22_000);
    expect(retryDelayMsOf(new Error('{"retryDelay": "1.5s"}'))).toBe(1_500);
  });

  it("returns null when absent or not an error", () => {
    expect(retryDelayMsOf(new Error("plain 429"))).toBeNull();
    expect(retryDelayMsOf("string error")).toBeNull();
  });
});

describe("searchGrounded", () => {
  const groundedReply = {
    candidates: [
      {
        content: { parts: [{ text: "Northgate Freight (northgate-freight.co.uk) is a Leeds haulier." }] },
        finishReason: "STOP",
        groundingMetadata: {
          webSearchQueries: ["logistics companies leeds"],
          groundingChunks: [
            {
              web: {
                uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
                title: "northgate-freight.co.uk",
              },
            },
          ],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
    modelVersion: "gemini-2.5-pro",
  } as Partial<GenerateContentResponse>;

  const searchRequest = {
    agent: "prospecting" as const,
    system: "You find real businesses.",
    instruction: "Find logistics firms in Leeds.",
  };

  it("enables the search tool and asks for no response schema", async () => {
    const { client, calls } = fakeClient(groundedReply);
    await new GeminiAiProvider(client).searchGrounded(searchRequest);

    expect(calls[0]!.config?.tools).toEqual([{ googleSearch: {} }]);
    // Structured output alongside the search tool is rejected by the API.
    expect(calls[0]!.config?.responseJsonSchema).toBeUndefined();
    expect(calls[0]!.config?.responseMimeType).toBeUndefined();
  });

  it("recovers the publisher domain from the title, not the redirect URL", async () => {
    const { client } = fakeClient(groundedReply);
    const response = await new GeminiAiProvider(client).searchGrounded(searchRequest);

    expect(response.citations).toHaveLength(1);
    expect(response.citations[0]!.domain).toBe("northgate-freight.co.uk");
    expect(response.queries).toEqual(["logistics companies leeds"]);
    expect(response.promptTokens).toBe(100);
  });

  /** The 429 that means "grounding was never enabled", not "slow down". */
  it("explains that grounding is billed separately when the search is refused", async () => {
    const client: GeminiClient = {
      models: {
        generateContent() {
          return Promise.reject(new ApiError({ message: "quota", status: 429 }));
        },
      },
    };

    await expect(new GeminiAiProvider(client).searchGrounded(searchRequest)).rejects.toThrow(
      /billed separately/,
    );
  });

  it("retries when the search model is overloaded", async () => {
    vi.useFakeTimers();
    try {
      const { client, calls } = fakeClient(
        new ApiError({ message: "overloaded", status: 503 }),
        groundedReply,
      );

      const pending = new GeminiAiProvider(client).searchGrounded(searchRequest);
      await vi.runAllTimersAsync();

      expect((await pending).citations).toHaveLength(1);
      expect(calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when the search produced neither text nor sources", async () => {
    const { client } = fakeClient({
      candidates: [{ content: { parts: [{ text: "" }] }, finishReason: "STOP" }],
    } as Partial<GenerateContentResponse>);

    await expect(new GeminiAiProvider(client).searchGrounded(searchRequest)).rejects.toBeInstanceOf(
      GeminiProviderError,
    );
  });
});

describe("citationDomain", () => {
  it("prefers the explicit domain field", () => {
    expect(citationDomain("Acme.co.uk", "Acme — About", "https://redirect")).toBe("acme.co.uk");
  });

  it("falls back to a title that is a bare hostname", () => {
    expect(citationDomain(undefined, "www.acme.co.uk")).toBe("acme.co.uk");
  });

  it("ignores a title that is prose rather than a hostname", () => {
    expect(citationDomain(undefined, "Acme — About us", "https://acme.co.uk/about")).toBe(
      "acme.co.uk",
    );
  });

  /** A redirect host would otherwise match every candidate and verify nothing. */
  it("never returns the grounding redirect host", () => {
    expect(
      citationDomain(
        undefined,
        undefined,
        "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
      ),
    ).toBeUndefined();
  });
});

describe("toGeminiSchema", () => {
  it("strips members Gemini rejects, at every depth", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: {
        claims: {
          type: "array",
          items: { type: "object", additionalProperties: false, properties: { url: { type: "string" } } },
        },
      },
      required: ["claims"],
    };

    expect(toGeminiSchema(schema)).toEqual({
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: { type: "object", properties: { url: { type: "string" } } },
        },
      },
      required: ["claims"],
    });
  });
});
