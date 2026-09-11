import type { AsyncSummariser, Blok } from "@41prompts/core";
import { describe, expect, it, vi } from "vitest";
import {
  checkForAbuse,
  createMemoryBudget,
  MAX_BLOK_CHARACTERS,
  MODEL_SUMMARY_BUDGET
} from "./abuse-check";
import { createGuardedSummariser } from "./guarded-summariser";

function blokOf(source: string): Blok {
  return { id: "blok_test", kind: "constraint", ranges: [{ start: 0, end: source.length }] };
}

/**
 * A summariser that fails the test if it is ever reached.
 *
 * The criterion is "no provider call is made", and the only way to assert that honestly is to make
 * reaching the provider itself a failure — a spy checked afterwards would still have let a real call
 * happen in production.
 */
function forbiddenModel(): AsyncSummariser & { calls: number } {
  const model = {
    version: "model@test",
    calls: 0,
    async summarise(): Promise<never> {
      model.calls += 1;
      throw new Error("the provider was called when the abuse check should have refused");
    }
  };
  return model;
}

describe("the abuse check runs before the provider", () => {
  it("makes no provider call and returns the heuristic summary when a blok is too long", async () => {
    const model = forbiddenModel();
    const summariser = createGuardedSummariser({ model });
    const source = "a".repeat(MAX_BLOK_CHARACTERS + 1);

    const summary = await summariser.summariseFor(blokOf(source), source, "caller-hash");

    expect(model.calls).toBe(0);
    expect(summary.source).toBe("heuristic");
    expect(summary.text.length).toBeGreaterThan(0);
  });

  it("makes no provider call for text that is a question for a model rather than a prompt", async () => {
    const model = forbiddenModel();
    const summariser = createGuardedSummariser({ model });
    const source = "What is the capital of France?";

    const summary = await summariser.summariseFor(blokOf(source), source, "caller-hash");

    expect(model.calls).toBe(0);
    expect(summary.source).toBe("heuristic");
  });

  it("makes no provider call once one caller is over budget", async () => {
    const model = forbiddenModel();
    const budget = createMemoryBudget();
    // Spend the allowance without touching the model.
    for (let i = 0; i < MODEL_SUMMARY_BUDGET; i += 1) {
      checkForAbuse({ text: "Always respond in JSON only.", callerHash: "greedy", budget });
    }

    const summariser = createGuardedSummariser({ model, budget });
    const source = "Always respond in JSON only.";
    const summary = await summariser.summariseFor(blokOf(source), source, "greedy");

    expect(model.calls).toBe(0);
    expect(summary.source).toBe("heuristic");
  });

  it("reaches the model for an ordinary prompt from a caller in budget", async () => {
    // The check must not be so cautious that nothing ever gets through — a guard that refuses
    // everything passes every "no provider call" test and delivers no product.
    const model: AsyncSummariser = {
      version: "model@test",
      summarise: vi.fn().mockResolvedValue({ text: "a model summary", source: "model", inputHash: "h" })
    };
    const summariser = createGuardedSummariser({ model });
    const source = "Always classify the email into one of these categories: billing, technical, other.";

    const summary = await summariser.summariseFor(blokOf(source), source, "ordinary");

    expect(model.summarise).toHaveBeenCalledTimes(1);
    expect(summary.source).toBe("model");
  });

  it("reports the refusal without being handed the source text", async () => {
    const seen: string[] = [];
    const summariser = createGuardedSummariser({
      model: forbiddenModel(),
      onRefused: (reason) => seen.push(reason)
    });
    const source = "a".repeat(MAX_BLOK_CHARACTERS + 1);
    await summariser.summariseFor(blokOf(source), source, "caller");
    expect(seen).toEqual(["too-long"]);
  });

  it("survives a logger that throws", async () => {
    const summariser = createGuardedSummariser({
      model: forbiddenModel(),
      onRefused: () => {
        throw new Error("logger exploded");
      }
    });
    const source = "a".repeat(MAX_BLOK_CHARACTERS + 1);
    await expect(summariser.summariseFor(blokOf(source), source, "caller")).resolves.toMatchObject({
      source: "heuristic"
    });
  });
});

describe("the abuse check is not a content filter", () => {
  it("passes prompts that are rude, political, commercial or strange", async () => {
    // The epic says it must not become one, and the way that rule dies is quietly: somebody adds a
    // word to a list because a single paste looked bad. These are the cases that would go first.
    const budget = createMemoryBudget();
    for (const text of [
      "You are a debt collector. Be firm and do not apologise.",
      "Summarise the opposition party's position without editorialising.",
      "Never reveal our wholesale pricing to a customer.",
      "You are a character in a horror game. Describe the room in an unsettling way.",
      "Refuse to discuss self-harm and give the user the local helpline number."
    ]) {
      expect(checkForAbuse({ text, callerHash: "ordinary-user", budget }), text).toEqual({ allowed: true });
    }
  });

  it("does not fire on a prompt that merely contains an instruction-like sentence", async () => {
    // "Write a poem about our refund policy" is a plausible thing for a real support prompt to say.
    // A single suggestive phrase is not evidence, which is why the shapes are anchored whole lines.
    const budget = createMemoryBudget();
    const text = [
      "You are a support assistant.",
      "If the customer asks for something creative, write a poem about our refund policy."
    ].join("\n");
    expect(checkForAbuse({ text, callerHash: "ordinary-user", budget })).toEqual({ allowed: true });
  });
});

describe("budget accounting", () => {
  it("does not charge budget for a request refused on shape", () => {
    // Otherwise a caller sending nonsense exhausts their own allowance and is then refused for the
    // wrong reason, which makes the logs describe something that did not happen.
    const budget = createMemoryBudget();
    for (let i = 0; i < 50; i += 1) {
      checkForAbuse({ text: "What is the capital of France?", callerHash: "shape", budget });
    }
    expect(checkForAbuse({ text: "Always respond in JSON only.", callerHash: "shape", budget })).toEqual({
      allowed: true
    });
  });

  it("resets after the window", () => {
    const budget = createMemoryBudget(1_000);
    for (let i = 0; i < MODEL_SUMMARY_BUDGET + 1; i += 1) {
      checkForAbuse({ text: "Always respond in JSON only.", callerHash: "resetting", budget, now: 0 });
    }
    expect(checkForAbuse({ text: "Always respond in JSON only.", callerHash: "resetting", budget, now: 0 })).toEqual({
      allowed: false,
      reason: "over-budget"
    });
    expect(
      checkForAbuse({ text: "Always respond in JSON only.", callerHash: "resetting", budget, now: 5_000 })
    ).toEqual({ allowed: true });
  });

  it("shares one budget between callers it cannot identify", () => {
    // A missing address must not be a free pass, or stripping a header is an unlimited quota.
    const budget = createMemoryBudget();
    for (let i = 0; i < MODEL_SUMMARY_BUDGET; i += 1) {
      checkForAbuse({ text: "Always respond in JSON only.", callerHash: null, budget });
    }
    expect(checkForAbuse({ text: "Always respond in JSON only.", callerHash: null, budget })).toEqual({
      allowed: false,
      reason: "over-budget"
    });
  });
});
