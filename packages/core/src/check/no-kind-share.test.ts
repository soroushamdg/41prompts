// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { checkKindFor } from "../compile/checks.js";
import { classify } from "../classify/classify.js";
import { segment } from "../segment/segment.js";
import { CLUSTER_FIXTURES } from "../cluster/fixtures/prompts.js";
import { DETECT_FIXTURES, NOISY_FIXTURES, QUIET_FIXTURES } from "../detect/fixtures/prompts.js";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";

/**
 * **How much of the corpus nothing can name a kind for** (EPIC-033 decision 7).
 *
 * EPIC-030 handed this epic the `no_kind` queue and asked for its size to be measured **before**
 * deciding how much of it a judge should attempt. That instruction is honoured literally: EPIC-033
 * points the judge at `needs_judgement` only, and this test is the measurement that a later epic
 * gets to decide on instead of guessing.
 *
 * **Reported, not gated.** The same shape as the three timing gates in `PROCESS.md`, and for the
 * same reason: the number is for a person to read, and a threshold invented today would be one
 * nobody measured. The only assertion is that the corpus is non-empty — a measurement over nothing
 * would print a confident `0%` and mean nothing at all, which is the failure mode worth guarding.
 */
describe("the no_kind share of the corpus", () => {
  it("reports how many expected bloks nothing can name a kind for", () => {
    const prompts = [...SEGMENT_FIXTURES, ...CLUSTER_FIXTURES].map((fixture) => fixture.text);
    const extra = [...DETECT_FIXTURES, ...NOISY_FIXTURES, ...QUIET_FIXTURES].map((fixture) => fixture.text);

    let expectedBloks = 0;
    let withoutKind = 0;
    const unnamed: string[] = [];

    for (const text of [...prompts, ...extra]) {
      for (const piece of segment(text)) {
        const body = piece.text.trim();
        if (body === "") continue;
        if (classify(piece).kind !== "expected") continue;
        expectedBloks += 1;
        if (checkKindFor(body) === undefined) {
          withoutKind += 1;
          if (unnamed.length < 8) unnamed.push(body.slice(0, 90));
        }
      }
    }

    // The guard: a measurement over an empty corpus would report a confident nothing.
    expect(expectedBloks).toBeGreaterThan(0);

    const share = Math.round((withoutKind / expectedBloks) * 100);
    console.log(
      `no_kind share: ${withoutKind} of ${expectedBloks} expected bloks (${share}%) have no derivable check kind`
    );
    for (const example of unnamed) console.log(`  no kind: ${example}`);
  });
});
