import { DEFAULT_MODEL_FOR } from "@41prompts/db";
import { describe, expect, it } from "vitest";
import { sdkProvider, type Generate, type GenerateResult } from "./ai-sdk";
import { anthropicProvider } from "./anthropic";
import { googleProvider } from "./google";
import { openaiProvider } from "./openai";

/**
 * Two kinds of test, each about one thing.
 *
 * **The logic tests inject `generate`.** They are about the usage fallback, the payload choice and
 * the model id — the things this repository decides. A test that faked HTTP instead would encode a
 * provider's wire format, which pins us to a shape none of us controls and which changes without
 * notice.
 *
 * **The wiring tests inject `fetch`.** They are about the one thing an injected `generate` cannot
 * see: which endpoint a provider is actually constructed against, and whether the key travelled.
 * A provider built against the wrong URL answers every logic test correctly and fails in production.
 *
 * Neither calls a provider. **No test in this repository does.**
 */

const PARAMS = { temperature: 0, maxOutputTokens: 1024 };
const KEY = "sk-test-0000000000000000000000";

function fakeGenerate(result: Partial<GenerateResult>, seen?: { args?: unknown }): Generate {
  return async (args) => {
    if (seen !== undefined) seen.args = args;
    return { text: "an answer", ...result } as GenerateResult;
  };
}

describe("sdkProvider", () => {
  it("passes the model id, the prompt and the params through", async () => {
    const seen: { args?: unknown } = {};
    const provider = sdkProvider("test", (id) => id as never, fakeGenerate({}, seen));
    await provider.complete({ model: "some-model", prompt: "hello", params: PARAMS });
    expect(seen.args).toMatchObject({ model: "some-model", prompt: "hello", temperature: 0, maxOutputTokens: 1024 });
  });

  it("drops a parameter that is not a number rather than sending nonsense", async () => {
    const seen: { args?: unknown } = {};
    const provider = sdkProvider("test", (id) => id as never, fakeGenerate({}, seen));
    await provider.complete({ model: "m", prompt: "hi", params: { temperature: "warm" } });
    expect(seen.args).toMatchObject({ temperature: undefined, maxOutputTokens: undefined });
  });

  it("stores the provider's own body when there is one", async () => {
    const body = { id: "msg_1", usage: { input_tokens: 9, output_tokens: 4 } };
    const provider = sdkProvider(
      "test",
      (id) => id as never,
      fakeGenerate({ usage: { inputTokens: 9, outputTokens: 4 }, response: { body } }),
    );
    const result = await provider.complete({ model: "m", prompt: "hi", params: PARAMS });
    expect(result.raw).toEqual(body);
    expect(result.inputTokens).toBe(9);
    expect(result.outputTokens).toBe(4);
  });

  /**
   * EPIC-031a's finding, now shared by three adapters: the SDK surfaced no body on the first real
   * call. The fallback has to **say** it is not a provider body, or a reader six months from now
   * mistakes a normalised view for the wire format.
   */
  it("labels the fallback payload rather than passing a normalised view off as the wire format", async () => {
    const provider = sdkProvider(
      "openai",
      (id) => id as never,
      fakeGenerate({ usage: { inputTokens: 3, outputTokens: 2 }, response: { modelId: "gpt-4.1-2025-04-14", id: "r1" } }),
    );
    const result = await provider.complete({ model: "m", prompt: "hi", params: PARAMS });
    expect(result.raw).toMatchObject({ provider: "openai", normalised: true, model: "gpt-4.1-2025-04-14" });
  });

  it("reads the deprecated `response` and the current `finalStep.response`, preferring whichever has data", async () => {
    const fromFinalStep = sdkProvider(
      "test",
      (id) => id as never,
      fakeGenerate({ finalStep: { response: { body: { from: "finalStep" } } } }),
    );
    expect((await fromFinalStep.complete({ model: "m", prompt: "hi", params: PARAMS })).raw).toEqual({
      from: "finalStep",
    });
  });

  /**
   * A missing count read as zero would charge nothing for a call that happened — the "assume zero"
   * failure the price table exists to prevent, arriving one layer down.
   */
  it("estimates rather than inventing a zero when usage is missing", async () => {
    const provider = sdkProvider("test", (id) => id as never, fakeGenerate({ text: "four" }));
    const result = await provider.complete({ model: "m", prompt: "a".repeat(400), params: PARAMS });
    expect(result.inputTokens).toBeGreaterThan(90);
    expect(result.outputTokens).toBeGreaterThan(0);
  });

  it("estimates one side when only the other is reported", async () => {
    const provider = sdkProvider("test", (id) => id as never, fakeGenerate({ usage: { inputTokens: 11 } }));
    const result = await provider.complete({ model: "m", prompt: "hi", params: PARAMS });
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBeGreaterThan(0);
  });
});

/**
 * The wiring: where each adapter actually sends a request, and that the key goes with it.
 *
 * The fake `fetch` answers with something the SDK cannot parse, so `generateText` throws. That is
 * fine and is the point — the assertion is on the **request**, which was already recorded by then.
 */
describe("each adapter calls its own provider", () => {
  const cases = [
    { name: "anthropic", build: anthropicProvider, host: "api.anthropic.com" },
    { name: "openai", build: openaiProvider, host: "api.openai.com" },
    { name: "google", build: googleProvider, host: "generativelanguage.googleapis.com" },
  ] as const;

  for (const { name, build, host } of cases) {
    it(`${name} is constructed against ${host} and sends the key`, async () => {
      const seen: { url?: string; headers?: Record<string, string>; body?: string } = {};
      const fetchImpl = (async (input: unknown, init?: unknown) => {
        seen.url = String(input);
        const request = (init ?? {}) as { headers?: Record<string, string>; body?: string };
        seen.headers = request.headers ?? {};
        seen.body = typeof request.body === "string" ? request.body : undefined;
        return new Response("not json", { status: 200, headers: { "content-type": "text/plain" } });
      }) as unknown as typeof globalThis.fetch;

      const provider = build(KEY, fetchImpl);
      await provider
        .complete({ model: DEFAULT_MODEL_FOR[name], prompt: "hello", params: PARAMS })
        .catch(() => undefined);

      expect(seen.url, `${name} was never called`).toBeDefined();
      expect(new URL(seen.url!).host).toBe(host);
      // **The key is in a header and not in the URL**, at every provider — Google's API accepts it
      // as a query parameter and that is the shape this project refuses everywhere.
      expect(seen.url).not.toContain(KEY);
      expect(JSON.stringify(seen.headers)).toContain(KEY);
      // And the prompt genuinely went, so this is not asserting on an empty request.
      expect(seen.body ?? "").toContain("hello");
    });
  }

  /** `.chat(...)`, not the Responses API — see the note in `openai.ts`. */
  it("uses OpenAI's stateless chat completions endpoint", async () => {
    let url = "";
    const fetchImpl = (async (input: unknown) => {
      url = String(input);
      return new Response("not json", { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    await openaiProvider(KEY, fetchImpl)
      .complete({ model: DEFAULT_MODEL_FOR.openai, prompt: "hello", params: PARAMS })
      .catch(() => undefined);
    expect(url).toContain("/chat/completions");
  });
});
