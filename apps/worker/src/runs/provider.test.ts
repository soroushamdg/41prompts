import { DEFAULT_RUN_MODEL } from "@41prompts/db";
import { describe, expect, it } from "vitest";
import { echoLastLineProvider, providerFor } from "./provider";
import { priceFor } from "./prices";

describe("providerFor", () => {
  it("has no provider when nothing is configured, rather than throwing", () => {
    // `undefined` becomes `provider_not_configured`, which is a sentence. A throw becomes a dead
    // job and a page that never finishes.
    expect(providerFor({})).toBeUndefined();
  });

  it("uses anthropic when a key is present", () => {
    const selected = providerFor({ ANTHROPIC_API_KEY: "sk-test-not-a-real-key" });
    expect(selected?.name).toBe("anthropic");
  });

  /**
   * The three guards on a test-only path in production code, asserted rather than promised.
   */
  it("never selects the fake without its flag", () => {
    expect(providerFor({})).toBeUndefined();
    expect(providerFor({ FAKE_PROVIDER: "0" })).toBeUndefined();
    expect(providerFor({ FAKE_PROVIDER: "true" })).toBeUndefined();
  });

  it("refuses the fake in production, whatever the flag says", () => {
    const selected = providerFor({ FAKE_PROVIDER: "1", DEPLOY_ENV: "production" });
    expect(selected).toBeUndefined();
  });

  it("prefers the fake over a real key when the flag is set outside production", () => {
    const selected = providerFor({
      FAKE_PROVIDER: "1",
      ANTHROPIC_API_KEY: "sk-test-not-a-real-key",
    });
    expect(selected?.name).toContain("fake");
  });

  it("names the provider without ever naming the key", () => {
    const selected = providerFor({ ANTHROPIC_API_KEY: "sk-ant-secret-value" });
    expect(selected?.name).not.toContain("sk-ant");
    expect(selected?.name).not.toContain("secret");
  });
});

describe("the fake provider", () => {
  it("answers with the last non-empty line of the prompt", async () => {
    const provider = echoLastLineProvider();
    const response = await provider.complete({
      model: "whatever",
      prompt: "You are a router.\n\nAnswer: All good.\n\n",
      params: {},
    });
    expect(response.text).toBe("Answer: All good.");
  });

  it("gives the same answer to the same prompt, every time", async () => {
    const provider = echoLastLineProvider();
    const ask = () => provider.complete({ model: "m", prompt: "a\nb", params: {} });
    expect((await ask()).text).toBe((await ask()).text);
  });

  it("reports token counts, so the cost path is exercised rather than bypassed", async () => {
    const response = await echoLastLineProvider().complete({ model: "m", prompt: "a".repeat(400), params: {} });
    expect(response.inputTokens).toBeGreaterThan(0);
    expect(response.outputTokens).toBeGreaterThan(0);
  });
});

describe("the pinned run model", () => {
  /**
   * `DEFAULT_RUN_MODEL` lives in `@41prompts/db` because the web writes it onto the row and the
   * worker calls it. A model absent from the price table does not run (EPIC-031 decision 4), so a
   * value here with no row there would refuse every run in the product with `model_not_priced`.
   */
  it("has a row in the price table", () => {
    expect(priceFor(DEFAULT_RUN_MODEL)).toBeDefined();
  });
});
