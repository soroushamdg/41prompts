import { DEFAULT_MODEL_FOR, MODEL_CATALOGUE, PROVIDERS, type ProviderName } from "@41prompts/db";
import { describe, expect, it } from "vitest";
import { MODEL_PRICES, PROVIDER_CONCURRENCY, concurrencyForModel, priceFor } from "./prices";

/**
 * The price table and the catalogue are two lists that must be the same list.
 *
 * **A model absent from the price table does not run** (EPIC-031 decision 4), so a model added to
 * `packages/db`'s catalogue and not here is a model this product offers and then refuses. That is a
 * failure a person meets at the end of a run they have already waited for, which is why it is a test
 * rather than a convention.
 */
describe("the price table and the catalogue agree", () => {
  it("prices every model in the catalogue", () => {
    const unpriced = MODEL_CATALOGUE.filter((model) => priceFor(model.id) === undefined).map((m) => m.id);
    expect(unpriced).toEqual([]);
  });

  it("has no priced model the catalogue does not offer", () => {
    const ids = new Set(MODEL_CATALOGUE.map((model) => model.id));
    expect(Object.keys(MODEL_PRICES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("agrees with the catalogue about who charges for what", () => {
    for (const model of MODEL_CATALOGUE) {
      expect(priceFor(model.id)!.provider, model.id).toBe(model.provider);
    }
  });

  it("prices each provider's default model, because that is the one a matrix run uses", () => {
    for (const provider of PROVIDERS) {
      expect(priceFor(DEFAULT_MODEL_FOR[provider]), provider).toBeDefined();
    }
  });
});

describe("every row is sourced and dated", () => {
  it("carries a date and a URL, because a price nobody can check is not a price", () => {
    for (const [id, price] of Object.entries(MODEL_PRICES)) {
      expect(price.readOn, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(price.source, id).toMatch(/^https:\/\//);
    }
  });

  it("charges something for everything, in both directions", () => {
    for (const [id, price] of Object.entries(MODEL_PRICES)) {
      expect(price.inputCentsPerMillion, id).toBeGreaterThan(0);
      expect(price.outputCentsPerMillion, id).toBeGreaterThan(0);
      // The reservation's upper bound. Zero would make the cap not a cap.
      expect(price.maxOutputTokens, id).toBeGreaterThan(1_000);
    }
  });

  /**
   * `CLAUDE.md` rule 7's reasoning applied to cost. The exceptions are named rather than excluded by
   * a pattern, because a pattern would quietly absorb the next alias somebody adds.
   */
  it("uses ids that pin a version", () => {
    const stableByPublisher = new Set(["claude-opus-5", "claude-sonnet-5", "gemini-2.5-pro", "gemini-2.5-flash"]);
    for (const id of Object.keys(MODEL_PRICES)) {
      if (stableByPublisher.has(id)) continue;
      expect(id, `${id} should carry a version or a date`).toMatch(/\d{4}-\d{2}-\d{2}|\d+-\d+-\d+/);
    }
  });
});

describe("per-provider concurrency", () => {
  it("has a number for every provider", () => {
    for (const provider of PROVIDERS) {
      expect(PROVIDER_CONCURRENCY[provider as ProviderName], provider).toBeGreaterThanOrEqual(1);
    }
  });

  /**
   * The point of a **per-provider** limit is that the providers differ. A table of equal numbers is
   * a mechanism with nothing in it, and this is the assertion that says so out loud.
   */
  it("is not the same number everywhere", () => {
    expect(new Set(Object.values(PROVIDER_CONCURRENCY)).size).toBeGreaterThan(1);
  });

  /** Google's unpaid quota is limited per minute, and nothing here retries a 429. */
  it("keeps Google sequential", () => {
    expect(PROVIDER_CONCURRENCY.google).toBe(1);
  });

  it("resolves a model to its provider's number, and an unknown model to one", () => {
    expect(concurrencyForModel(DEFAULT_MODEL_FOR.openai)).toBe(PROVIDER_CONCURRENCY.openai);
    expect(concurrencyForModel(DEFAULT_MODEL_FOR.google)).toBe(1);
    expect(concurrencyForModel("a-model-nobody-has-heard-of")).toBe(1);
  });
});
