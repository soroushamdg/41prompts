// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { drift } from "./drift.js";
import type { PromptBlok, SpanCache } from "./types.js";

/**
 * The criterion: 200 bloks compile in under 50 ms, **reported with headroom**.
 *
 * `docs/PROCESS.md` is blunt about absolute millisecond budgets — one was demoted from a gate to a
 * reported number after failing CI at 106.6 ms against 100, on the *minimum* of ten warm runs, which
 * means an absolute budget on a shared runner measures the runner. So this one asserts only because
 * the headroom is three orders of magnitude, not one, and the measured ratio is logged on every run
 * so the next person can see that for themselves rather than take this comment's word for it.
 *
 * **If it ever flakes, the answer is the same as it was there: demote it to a reported number, do
 * not widen the bar.** And note what a demotion would cost — nothing here catches a constant-factor
 * regression except this number, because `compile` is linear by construction and there is no growth
 * exponent worth measuring.
 */

const BUDGET_MS = 50;
const RUNS = 10;

function bloksOf(count: number): PromptBlok[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `b${i}`,
    kind: i % 7 === 0 ? ("expected" as const) : ("constraint" as const),
    order: i * 10,
    // Around 200 code units each, so 200 bloks is a ~40 KB prompt — larger than anything the corpus
    // holds and larger than the prompts this is built for.
    text: `Rule ${i}: ${"the model must not invent a field that is not in the input schema. ".repeat(3)}`
  }));
}

/** Minimum of several runs: contention can only ever make a measurement slower, never faster. */
function fastest(run: () => void, runs = RUNS): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
}

describe("compile is fast enough to run on every keystroke", () => {
  it("compiles 200 bloks well inside the 50 ms budget", () => {
    const bloks = bloksOf(200);
    const ms = fastest(() => void compile(bloks));
    console.log(`compile(200 bloks): ${ms.toFixed(3)} ms — ${(BUDGET_MS / ms).toFixed(0)}x headroom on a ${BUDGET_MS} ms budget`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  /**
   * **A warm cache is not currently faster, and saying otherwise would be a measurement nobody
   * made.** `render` is the identity function in v0, so a cache hit returns the same string a miss
   * would have returned, having done a `Map` lookup to get there — it is a rounding error in both
   * directions. The cache is there for the day `render` does work, and for the *correctness*
   * property `compile.test.ts` asserts: that changing one blok adds exactly one entry.
   *
   * Measured here anyway so that the day it starts mattering, there is a before.
   */
  it("stays inside the budget with a warm cache, without pretending the cache is why", () => {
    const bloks = bloksOf(200);
    const cache: SpanCache = new Map();
    compile(bloks, { cache });
    const ms = fastest(() => void compile(bloks, { cache }));
    console.log(`compile(200 bloks, warm cache): ${ms.toFixed(3)} ms — render() is identity in v0, so this is expected to match the cold number`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });

  it("reports drift over 200 bloks inside the same budget", () => {
    // EPIC-021b will call this whenever the pane needs to know what is stale, which is often.
    const bloks = bloksOf(200);
    const compiled = compile(bloks);
    const ms = fastest(() => void drift(compiled, bloks));
    console.log(`drift(200 bloks): ${ms.toFixed(3)} ms`);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
