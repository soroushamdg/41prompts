// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";
import { growthExponent, RATIO_RUNS } from "../perf/measure.js";
import { segment } from "../segment/segment.js";
import type { Segment } from "../segment/types.js";
import { cluster } from "./cluster.js";

/**
 * `cluster()` had no throughput gate at all until self-review pointed out that `segment()` has one
 * and this does not — which is how it came to be O(n²) in segment count without anybody noticing:
 * 57 ms for 1,000 mutually distinct segments, 192 ms for 2,000, 726 ms for 4,000.
 *
 * The gate matches the segmenter's, and for the same reason (the advisor's ruling on EPIC-010's open
 * question 4): real prompts are 1–20 KB, so 100 KB is already five times the top of that range.
 */
function timeCluster(segments: readonly Segment[]): number {
  const started = performance.now();
  const bloks = cluster(segments);
  const elapsed = performance.now() - started;
  expect(bloks.length).toBeGreaterThanOrEqual(0);
  return elapsed;
}

function fastestCluster(segments: readonly Segment[], runs = 5): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) best = Math.min(best, timeCluster(segments));
  return best;
}

/** A prompt of a given size, from the corpus, so it exercises every kind and every merge path. */
function sizedPrompt(codeUnits: number): string {
  const corpus = SEGMENT_FIXTURES.map((f) => f.text).join("\n\n");
  let input = corpus;
  while (input.length < codeUnits) input += `\n\n${corpus}`;
  return input.slice(0, codeUnits);
}

/**
 * Segments that share no vocabulary at all, so nothing can ever merge and the group list grows
 * one-for-one. This is the shape that exercises the candidate lookup, and the shape a corpus-built
 * input cannot produce — a repeated corpus saturates into a fixed number of groups after the first
 * repetition, which is exactly why the quadratic behaviour hid.
 */
function mutuallyDistinct(count: number): string {
  return Array.from({ length: count }, (_, i) => `wordaaa${i} wordbbb${i} wordccc${i} worddddd${i}.`).join("\n\n");
}

describe("cluster() throughput", () => {
  it("clusters a 100 KB prompt in under 100 ms", () => {
    const segments = segment(sizedPrompt(102_400));
    const cold = timeCluster(segments);
    for (let warmUp = 0; warmUp < 3; warmUp++) timeCluster(segments);
    const warm = fastestCluster(segments, 10);
    console.log(`cluster 100 KB (${segments.length} segments): ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm`);
    expect(warm).toBeLessThan(100);
  });

  it("reports the 1 MB timing without gating on it", () => {
    const segments = segment(sizedPrompt(1_048_576));
    const cold = timeCluster(segments);
    const warm = fastestCluster(segments);
    console.log(`cluster 1 MB (${segments.length} segments): ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm (reported, not gated)`);
    expect(warm).toBeGreaterThan(0);
  });

  it("clusters 2,000 mutually distinct segments in under 100 ms", () => {
    // The pathological shape, at a size a 100 KB prompt could actually reach. Before the candidate
    // indexes this took 192 ms; the gate is here so the next person who touches the merge loop finds
    // out from a red test rather than from a browser tab.
    const segments = segment(mutuallyDistinct(2_000));
    const cold = timeCluster(segments);
    for (let warmUp = 0; warmUp < 3; warmUp++) timeCluster(segments);
    const warm = fastestCluster(segments, 10);
    console.log(`cluster 2,000 distinct segments: ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm`);
    expect(warm).toBeLessThan(100);
  });

  it("grows no faster than input^1.6 as the number of distinct segments grows", { timeout: 120_000 }, () => {
    // Interleaved and fastest-of over `RATIO_RUNS` samples — see `perf/measure.ts`. This gate never
    // flaked, but it shared its estimator with the one that did (twice), so it shares the fix:
    // leaving a known-fragile measurement in place because it has not failed yet is the same
    // mistake, later.
    const small = segment(mutuallyDistinct(1_000));
    const large = segment(mutuallyDistinct(4_000));
    timeCluster(small);
    timeCluster(large);

    const exponent = growthExponent(timeCluster, small, large, 4);
    console.log(`cluster growth exponent ${exponent.toFixed(2)} over ${RATIO_RUNS} runs per side (4x segments)`);
    expect(exponent, `grew as segments^${exponent.toFixed(2)}`).toBeLessThan(1.6);
  });
});
