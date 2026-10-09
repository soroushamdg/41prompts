import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, type LanguageModel } from "ai";
import type { Provider } from "@/db/schema";
import { isE2E } from "@/lib/env";
import { PROVIDER_LABEL } from "@/lib/providers";

/* One run (M06): the compiled prompt as the system message, the test message
   as the user message, one model, the user's own key. */

const MOCK_REPLY =
  "Hi Sam, I am sorry your order has not shipped yet. It is packed and leaves our warehouse today, and tracking follows within 24 hours. If it is not with you by Friday, reply here and I will set up a replacement or a return.";

export async function languageModel(provider: Provider, modelId: string, apiKey: string): Promise<LanguageModel> {
  if (isE2E()) return mockModel(modelId);
  if (provider === "openai") return createOpenAI({ apiKey })(modelId);
  if (provider === "anthropic") return createAnthropic({ apiKey })(modelId);
  return createGoogleGenerativeAI({ apiKey })(modelId);
}

async function mockModel(modelId: string): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const words = MOCK_REPLY.split(" ");
  return new MockLanguageModelV4({
    modelId,
    doStream: async () => ({
      stream: simulateReadableStream({
        initialDelayInMs: 120,
        chunkDelayInMs: 20,
        chunks: [
          { type: "text-start", id: "t" },
          ...words.map((w, i) => ({ type: "text-delta" as const, id: "t", delta: (i ? " " : "") + w })),
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 412, noCache: 412, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: Math.round(words.length * 1.3), text: Math.round(words.length * 1.3), reasoning: 0 },
            },
          },
        ],
      }),
    }),
  }) as unknown as LanguageModel;
}

/** Plain words for a failed run. Never echoes the provider's raw message. */
export function runErrorMessage(provider: Provider, error: unknown): string {
  const name = PROVIDER_LABEL[provider];
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    const body = (error.responseBody ?? "").toLowerCase();
    if (s === 401 || s === 403) return `${name} refused your key. Check it in Settings, then run again.`;
    if (s === 429 && /quota|credit|billing|insufficient/.test(body)) return `Your ${name} account is out of credit or over its quota.`;
    if (s === 429) return `${name} is rate limiting your key. Try again in a moment.`;
    if (s === 404 || (s === 400 && /model/.test(body))) return `This model is not available on your ${name} account. Pick another one.`;
    if (s === 400 && /credit|billing|balance/.test(body)) return `Your ${name} account is out of credit.`;
    if (s >= 500) return `${name} had a problem on its side (${s}). Try again in a moment.`;
    return `${name} returned an error (${s || "unknown"}).`;
  }
  return `The run did not finish. ${name} may be unreachable; try again.`;
}
