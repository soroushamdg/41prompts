// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";
import { generatePrompt, NAMED_EDGE_CASES } from "../segment/fixtures/generate.js";
import { segment } from "../segment/segment.js";
import { cluster } from "./cluster.js";
import { CLUSTER_FIXTURES } from "./fixtures/prompts.js";
import { checkBlokInvariants } from "./invariants.js";

const GENERATED_CASE_COUNT = 1_000 - NAMED_EDGE_CASES.length;

/** Every prompt this package commits, plus the generated ones. */
function everyFixture(): ReadonlyArray<readonly [string, string]> {
  return [
    ...SEGMENT_FIXTURES.map((f) => [`segment:${f.name}`, f.text] as const),
    ...CLUSTER_FIXTURES.map((f) => [`cluster:${f.name}`, f.text] as const)
  ];
}

describe("cluster() invariants", () => {
  it.each(everyFixture().map(([name, text]) => ({ name, text })))("hold on $name", ({ text }) => {
    const segments = segment(text);
    expect(checkBlokInvariants(segments, cluster(segments))).toEqual([]);
  });

  it.each(NAMED_EDGE_CASES.map(([name, text]) => ({ name, text })))("hold on $name", ({ text }) => {
    const segments = segment(text);
    expect(checkBlokInvariants(segments, cluster(segments))).toEqual([]);
  });

  it(`hold on ${GENERATED_CASE_COUNT} generated inputs (seeds 41000..${41_000 + GENERATED_CASE_COUNT - 1})`, () => {
    // The same generator and the same seeds EPIC-010's reconstruction property uses, so a failure
    // here and a failure there name the same input.
    for (let i = 0; i < GENERATED_CASE_COUNT; i++) {
      const seed = 41_000 + i;
      const segments = segment(generatePrompt(seed));
      const violations = checkBlokInvariants(segments, cluster(segments));
      expect(violations, `seed ${seed} produced ${violations.length} violation(s)`).toEqual([]);
    }
  });

  it("never coalesces two ranges a blok owns, even when they are adjacent", () => {
    // Decision 6: a range must never cover text the blok does not own, and never coalescing is
    // that rule with no edge cases. Adjacent ranges do occur — consecutive list items that merge —
    // so this is a real case, not a hypothetical one.
    let adjacentPairsSeen = 0;
    for (const [, text] of everyFixture()) {
      const segments = segment(text);
      for (const blok of cluster(segments)) {
        for (let i = 1; i < blok.ranges.length; i++) {
          const previous = blok.ranges[i - 1]!;
          const current = blok.ranges[i]!;
          expect(current.start).toBeGreaterThan(previous.end - 1);
          if (text.slice(previous.end, current.start).trim() === "") adjacentPairsSeen += 1;
        }
      }
    }
    expect(adjacentPairsSeen).toBeGreaterThan(0);
  });

  it("assigns every segment to exactly one blok across the whole corpus", () => {
    for (const [name, text] of everyFixture()) {
      const segments = segment(text);
      const bloks = cluster(segments);
      const owned = bloks.flatMap((blok) => blok.ranges).length;
      expect(owned, `${name}: ${segments.length} segments became ${owned} owned ranges`).toBe(segments.length);
    }
  });
});
