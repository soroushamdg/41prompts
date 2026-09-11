// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { COARSE_RATIO_RUNS, growthExponent } from "../perf/measure.js";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";
import { segment } from "../segment/segment.js";
import type { Blok } from "../cluster/types.js";
import { detect } from "./detect.js";

/**
 * `detect()` had no throughput gate until self-review pointed out that `segment()` and `cluster()`
 * both have one and this does not — which is how it came to be quadratic in sentence count without
 * anybody noticing: **12.6 seconds on a 1 MB prompt**, on the main thread, in the browser tab
 * EPIC-013 runs it in.
 *
 * The gate matches the other two, and for the same reason (the advisor's ruling on EPIC-010's open
 * question 4): real prompts are 1–20 KB, so 100 KB is already five times the top of that range.
 */
function sizedPrompt(codeUnits: number): string {
  const corpus = SEGMENT_FIXTURES.map((f) => f.text).join("\n\n");
  let input = corpus;
  while (input.length < codeUnits) input += `\n\n${corpus}`;
  return input.slice(0, codeUnits);
}

function timeDetect(bloks: readonly Blok[], source: string): number {
  const started = performance.now();
  const findings = detect(bloks, source);
  const elapsed = performance.now() - started;
  expect(findings.length).toBeGreaterThanOrEqual(0);
  return elapsed;
}

function fastest(bloks: readonly Blok[], source: string, runs = 5): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) best = Math.min(best, timeDetect(bloks, source));
  return best;
}

describe("detect() throughput", () => {
  it("detects on a 100 KB prompt in under 100 ms", () => {
    const source = sizedPrompt(102_400);
    const bloks = cluster(segment(source));
    const cold = timeDetect(bloks, source);
    for (let warmUp = 0; warmUp < 3; warmUp++) timeDetect(bloks, source);
    const warm = fastest(bloks, source, 10);
    console.log(`detect 100 KB (${bloks.length} bloks): ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm`);
    expect(warm).toBeLessThan(100);
  });

  it("runs the whole pipeline on a 100 KB prompt in under 300 ms", () => {
    // The number the epic asks for: the 100 KB gate *with detection included*, end to end.
    const source = sizedPrompt(102_400);
    const run = (): number => {
      const started = performance.now();
      detect(cluster(segment(source)), source);
      return performance.now() - started;
    };
    run();
    run();
    let warm = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 5; i++) warm = Math.min(warm, run());
    console.log(`segment + cluster + detect, 100 KB: ${warm.toFixed(1)} ms warm`);
    expect(warm).toBeLessThan(300);
  });

  it("reports the 1 MB timing without gating on it", () => {
    const source = sizedPrompt(1_048_576);
    const bloks = cluster(segment(source));
    const warm = fastest(bloks, source, 3);
    console.log(`detect 1 MB (${bloks.length} bloks): ${warm.toFixed(1)} ms warm (reported, not gated)`);
    expect(warm).toBeGreaterThan(0);
  });

  // A generous timeout, not a widened bar: this gate deliberately measures many times and each
  // measurement is a 128 KB and a 512 KB detection. Under CI contention it is slower still, and a
  // timeout failure would be exactly the flake this change exists to remove.
  it("grows no faster than input^1.6 as the prompt grows", { timeout: 120_000 }, () => {
    // Before the token indexes this was a clean 4x per doubling — quadratic. Interleaved and
    // fastest-of over `RATIO_RUNS` samples, sharing the estimator fix EPIC-014 made after the
    // segmenter's equivalent gate flaked twice on CI.
    const small = sizedPrompt(128 * 1024);
    const large = sizedPrompt(512 * 1024);
    const smallBloks = cluster(segment(small));
    const largeBloks = cluster(segment(large));
    timeDetect(smallBloks, small);
    timeDetect(largeBloks, large);

    // `detect` takes two arguments, so each side is closed over as a nullary measurement and the
    // shared helper interleaves them over `RATIO_RUNS` samples — see `perf/measure.ts`.
    const exponent = growthExponent(
      (run: () => number) => run(),
      () => timeDetect(smallBloks, small),
      () => timeDetect(largeBloks, large),
      4,
      COARSE_RATIO_RUNS
    );
    console.log(`detect growth exponent ${exponent.toFixed(2)} over ${COARSE_RATIO_RUNS} runs per side (4x input)`);
    expect(exponent, `grew as input^${exponent.toFixed(2)}`).toBeLessThan(1.6);
  });
});
