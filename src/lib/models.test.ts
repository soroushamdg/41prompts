import { describe, expect, it } from "vitest";
import { costUsd, formatCost, MODELS } from "./models";

describe("models and cost", () => {
  it("offers at least one model per provider", () => {
    for (const list of Object.values(MODELS)) expect(list.length).toBeGreaterThan(0);
  });
  it("estimates cost from list prices", () => {
    expect(costUsd("anthropic", "claude-sonnet-5-5", 1_000_000, 100_000)).toBeCloseTo(3);
    expect(costUsd("openai", "not-a-model", 10, 10)).toBeNull();
    expect(formatCost(0.0011)).toBe("$0.0011");
    expect(formatCost(0.37)).toBe("$0.370");
    expect(formatCost(null)).toBe("—");
  });
});
