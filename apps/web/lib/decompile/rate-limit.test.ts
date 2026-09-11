import { beforeEach, describe, expect, it } from "vitest";
import { checkLimit, DECOMPILE_LIMIT, resetLimitsForTest, SHARE_LIMIT } from "./rate-limit";

beforeEach(() => resetLimitsForTest());

const NOW = 1_700_000_000_000;

describe("rate limits", () => {
  it("allows up to the limit and refuses the next one", () => {
    for (let i = 0; i < DECOMPILE_LIMIT.max; i += 1) {
      expect(checkLimit("ip-a", DECOMPILE_LIMIT, NOW).allowed, `attempt ${i + 1}`).toBe(true);
    }
    expect(checkLimit("ip-a", DECOMPILE_LIMIT, NOW).allowed).toBe(false);
  });

  it("names the limit in the message and says when it lifts, without implying wrongdoing", () => {
    for (let i = 0; i < DECOMPILE_LIMIT.max; i += 1) checkLimit("ip-b", DECOMPILE_LIMIT, NOW);
    const verdict = checkLimit("ip-b", DECOMPILE_LIMIT, NOW);

    expect(verdict.allowed).toBe(false);
    expect(verdict.message).toContain(DECOMPILE_LIMIT.name);
    expect(verdict.message).toMatch(/try again in/i);
    expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
    // Somebody who pastes thirty prompts in an hour is interested, not hostile.
    expect(verdict.message).not.toMatch(/abuse|violation|blocked|forbidden|suspicious/i);
  });

  it("resets after the window", () => {
    for (let i = 0; i < DECOMPILE_LIMIT.max + 1; i += 1) checkLimit("ip-c", DECOMPILE_LIMIT, NOW);
    expect(checkLimit("ip-c", DECOMPILE_LIMIT, NOW).allowed).toBe(false);
    expect(checkLimit("ip-c", DECOMPILE_LIMIT, NOW + DECOMPILE_LIMIT.windowMs + 1).allowed).toBe(true);
  });

  it("keeps separate buckets per caller and per limit", () => {
    for (let i = 0; i < DECOMPILE_LIMIT.max + 1; i += 1) checkLimit("ip-d", DECOMPILE_LIMIT, NOW);
    // A different caller is unaffected…
    expect(checkLimit("ip-e", DECOMPILE_LIMIT, NOW).allowed).toBe(true);
    // …and so is the same caller against a different limit, or exhausting one would silently
    // exhaust the others.
    expect(checkLimit("ip-d", SHARE_LIMIT, NOW).allowed).toBe(true);
  });

  it("gives an unidentified caller one shared bucket rather than a free pass", () => {
    // Otherwise stripping a header is an unlimited quota.
    for (let i = 0; i < DECOMPILE_LIMIT.max; i += 1) {
      expect(checkLimit(null, DECOMPILE_LIMIT, NOW).allowed).toBe(true);
    }
    expect(checkLimit(null, DECOMPILE_LIMIT, NOW).allowed).toBe(false);
  });

  it("shares no state between the decompile and share limits, which have different maxima", () => {
    expect(SHARE_LIMIT.max).toBeLessThan(DECOMPILE_LIMIT.max);
    for (let i = 0; i < SHARE_LIMIT.max; i += 1) {
      expect(checkLimit("ip-f", SHARE_LIMIT, NOW).allowed).toBe(true);
    }
    expect(checkLimit("ip-f", SHARE_LIMIT, NOW).allowed).toBe(false);
    expect(checkLimit("ip-f", DECOMPILE_LIMIT, NOW).allowed).toBe(true);
  });

  it("stays bounded when a great many callers arrive", () => {
    // The store is a Map keyed by stranger — an unbounded allocation driven by strangers is the
    // shape of problem this module exists to prevent, so it must not introduce one.
    for (let i = 0; i < 12_000; i += 1) checkLimit(`ip-${i}`, DECOMPILE_LIMIT, NOW);
    // Still serving correctly after eviction; a forgotten counter only ever forgives.
    expect(checkLimit("ip-new", DECOMPILE_LIMIT, NOW).allowed).toBe(true);
  });
});
