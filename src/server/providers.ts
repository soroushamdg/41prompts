import "server-only";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { APICallError, type LanguageModel } from "ai";
import { type ProviderDef, providerById, type Secret, type Settings } from "@/lib/catalog";
import { isE2E } from "@/lib/env";
import { guardedFetch, networkReason } from "./net/guarded-fetch";

/* Builds the AI SDK model for one of the user's models (M06, M07). Every
   provider gets the guarded fetch, so a Custom URL can only reach the public
   internet, and never falls back to credentials from our own environment. */

const MOCK_REPLY =
  "Hi Sam, I am sorry your order has not shipped yet. It is packed and leaves our warehouse today, and tracking follows within 24 hours. If it is not with you by Friday, reply here and I will set up a replacement or a return.";

export type ServerModel = { provider: string; modelId: string; settings: Settings };

/** The base URL a server-run model talks to. */
export function baseUrlFor(def: ProviderDef, settings: Settings): string {
  if (def.protocol === "azure") return `https://${settings.resourceName}.openai.azure.com/openai/v1`;
  if (def.protocol === "bedrock") return `https://bedrock-runtime.${settings.region}.amazonaws.com`;
  // cleanSettings keeps a baseURL only for providers that let the user set one.
  return (settings.baseURL ?? def.baseURL ?? "").replace(/\/+$/, "");
}

export async function languageModelFor(m: ServerModel, secret: Secret | null): Promise<LanguageModel> {
  if (isE2E()) return mockModel(m.modelId);
  const def = providerById(m.provider);
  if (!def) throw new Error(`Unknown provider ${m.provider}.`);
  const s = m.settings;
  const apiKey = secret?.apiKey;
  const fetch = guardedFetch;
  switch (def.protocol) {
    case "openai":
      return createOpenAI({ apiKey: apiKey ?? "", organization: s.organization, project: s.project, fetch })(m.modelId);
    case "anthropic":
      return createAnthropic({ apiKey: apiKey ?? "", fetch })(m.modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey: apiKey ?? "", fetch })(m.modelId);
    case "azure":
      return createAzure({ resourceName: s.resourceName, apiKey: apiKey ?? "", apiVersion: s.apiVersion || undefined, fetch }).chat(m.modelId);
    case "bedrock":
      return createAmazonBedrock({
        region: s.region,
        fetch,
        ...(apiKey
          ? { apiKey }
          : {
              // Explicit, so the SDK never reaches for the host's own AWS credentials.
              credentialProvider: async () => ({ accessKeyId: secret?.accessKeyId ?? "", secretAccessKey: secret?.secretAccessKey ?? "", sessionToken: secret?.sessionToken }),
            }),
      })(m.modelId);
    case "openai-compatible":
      return createOpenAICompatible({
        name: def.id,
        baseURL: baseUrlFor(def, s),
        apiKey: apiKey || undefined,
        headers: { ...def.headers, ...secret?.headers },
        includeUsage: s.includeUsage ?? def.includeUsage,
        fetch,
      })(m.modelId);
  }
}

async function mockModel(modelId: string): Promise<LanguageModel> {
  const { MockLanguageModelV4 } = await import("ai/test");
  const { simulateReadableStream } = await import("ai");
  const words = MOCK_REPLY.split(" ");
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async () => ({
      content: [{ type: "text", text: "pong" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
      warnings: [],
    }),
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

/** Plain words for a failed call. Never echoes the provider's raw message. */
export function providerErrorMessage(name: string, error: unknown, where: "run" | "test" = "run"): string {
  const net = networkReason(error);
  if (net === "blocked") return "That address is private or not https://, so our server will not call it. For a model on your computer or network, set it to run in your browser.";
  if (net === "dns") return `${name}'s address could not be found. Check the URL.`;
  if (net === "refused") return `${name} did not accept the connection. Check the URL and that the server is running.`;
  if (net === "timeout") return `${name} took too long to answer. Try again in a moment.`;
  if (net === "tls") return `${name}'s certificate is not valid, so the connection was refused.`;
  if (net === "redirect") return `${name} tried to redirect the call. Use the final URL instead.`;
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    const body = (error.responseBody ?? "").toLowerCase();
    const fix = where === "run" ? " Check it in Settings, then run again." : "";
    if (s === 401 || s === 403) return `${name} refused the key.${fix}`;
    if (s === 402 || (s === 429 && /quota|credit|billing|insufficient|balance/.test(body))) return `Your ${name} account is out of credit or over its quota.`;
    if (s === 429) return `${name} is rate limiting this key. Try again in a moment.`;
    if (s === 404 || (s === 400 && /model/.test(body))) return `${name} does not have this model, or your account cannot use it. Check the model ID.`;
    if (s === 400 && /credit|billing|balance/.test(body)) return `Your ${name} account is out of credit.`;
    if (s >= 500) return `${name} had a problem on its side (${s}). Try again in a moment.`;
    return `${name} returned an error (${s || "unknown"}).`;
  }
  return where === "run" ? `The run did not finish. ${name} may be unreachable; try again.` : `${name} did not answer. Try again in a moment.`;
}
