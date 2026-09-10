// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { generatePrompt, NAMED_EDGE_CASES } from "./fixtures/generate.js";
import { checkSegmentInvariants } from "./invariants.js";
import { segment } from "./segment.js";

const GENERATED_CASE_COUNT = 1_000 - NAMED_EDGE_CASES.length;

describe("segment() invariants", () => {
  it.each(NAMED_EDGE_CASES.map(([name, input]) => ({ name, input })))(
    "holds every invariant on $name",
    ({ input }) => {
      expect(checkSegmentInvariants(input, segment(input))).toEqual([]);
    }
  );

  it(`holds every invariant on ${GENERATED_CASE_COUNT} generated inputs (seeds 41000..${41_000 + GENERATED_CASE_COUNT - 1})`, () => {
    for (let i = 0; i < GENERATED_CASE_COUNT; i++) {
      const seed = 41_000 + i;
      const input = generatePrompt(seed);
      const violations = checkSegmentInvariants(input, segment(input));
      // Report the seed, not the input: the input is regenerated from the seed by
      // `generatePrompt(seed)`, and printing 8 KB of adversarial Unicode helps nobody.
      expect(violations, `seed ${seed} produced ${violations.length} violation(s)`).toEqual([]);
    }
  });

  it("reconstructs 1,000 inputs byte for byte from segments plus gaps", () => {
    const inputs = [
      ...NAMED_EDGE_CASES.map(([, input]) => input),
      ...Array.from({ length: GENERATED_CASE_COUNT }, (_, i) => generatePrompt(41_000 + i))
    ];
    expect(inputs).toHaveLength(1_000);

    for (const input of inputs) {
      const segments = segment(input);
      let rebuilt = "";
      let cursor = 0;
      for (const s of segments) {
        rebuilt += input.slice(cursor, s.start) + input.slice(s.start, s.end);
        cursor = s.end;
      }
      rebuilt += input.slice(cursor);
      expect(rebuilt).toBe(input);
    }
  });

  it("never cuts a surrogate pair in half", () => {
    const inputs = [
      ...NAMED_EDGE_CASES.map(([, input]) => input),
      ...Array.from({ length: GENERATED_CASE_COUNT }, (_, i) => generatePrompt(41_000 + i))
    ];

    for (const input of inputs) {
      for (const s of segment(input)) {
        const before = input.charCodeAt(s.start - 1);
        const first = input.charCodeAt(s.start);
        const last = input.charCodeAt(s.end - 1);
        const after = input.charCodeAt(s.end);
        // A boundary is only ever placed on whitespace, a line end, or after `.!?` — none of
        // which are surrogates — so a high surrogate must never sit immediately before a
        // segment start, and a low surrogate must never sit immediately after a segment end.
        const cutsAtStart = before >= 0xd800 && before <= 0xdbff && first >= 0xdc00 && first <= 0xdfff;
        const cutsAtEnd = last >= 0xd800 && last <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
        expect(cutsAtStart, `segment [${s.start}, ${s.end}) starts mid-pair`).toBe(false);
        expect(cutsAtEnd, `segment [${s.start}, ${s.end}) ends mid-pair`).toBe(false);
      }
    }
  });
});
