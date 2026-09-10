// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { classify, heuristicPatterns } from "./classify.js";
import labelled from "./fixtures/labelled.json" with { type: "json" };

/** The labelled table's accuracy target (decision 5). */
const ACCURACY_TARGET = 0.9;

function classifyText(text: string) {
  return classify({ text, start: 0, end: text.length });
}

describe("classify() against the labelled table", () => {
  it(`is at least ${ACCURACY_TARGET * 100}% accurate on the ${labelled.length}-example labelled table`, () => {
    const misses: string[] = [];
    for (const row of labelled) {
      const got = classifyText(row.text);
      if (got.kind !== row.expected) {
        misses.push(
          `${row.fixture}[${row.index}] expected ${row.expected}, got ${got.kind} ` +
            `via ${got.matched} — ${JSON.stringify(row.text.slice(0, 88))}`
        );
      }
    }
    const accuracy = (labelled.length - misses.length) / labelled.length;
    console.log(`labelled-table accuracy ${(accuracy * 100).toFixed(1)}% (${misses.length} miss(es) of ${labelled.length})`);
    for (const miss of misses) console.log(`  miss: ${miss}`);
    expect(accuracy).toBeGreaterThanOrEqual(ACCURACY_TARGET);
  });
});

/**
 * A second, small labelled set of single sentences — kept after EPIC-013 paid the debt below.
 *
 * **The debt, and how it was paid.** EPIC-011a wrote here: "The EPIC-010 corpus contains no image
 * segment and no expectation segment — 25 real prompts, and not one of them multimodal or written as
 * a check. So three of the six kinds get no coverage from the accuracy table... these heuristics have
 * never seen a prompt somebody actually wrote." EPIC-013 added four whole prompts to the corpus
 * (`segment/fixtures/multimodal.ts`) and 32 of their segments to the table above, so `image_ref`,
 * `image_input` and `expected` are now scored on real prompts rather than only on the sentences here.
 *
 * These stay because they are a different test: isolated sentences with no surrounding prompt to lean
 * on, which is the harder case and the one that catches a heuristic that only works in context.
 */
const MULTIMODAL: ReadonlyArray<readonly [string, string]> = [
  ["image_ref", "Compare the layout to the reference: ![current homepage](./shots/home.png)"],
  ["image_ref", 'Use the palette from <img src="https://cdn.example.com/brand/palette.jpg" alt="palette">.'],
  ["image_ref", "The annotated wireframe is at design/wireframe-v3.png and is the source of truth."],
  ["image_input", "Describe {{ user_image }} in one sentence."],
  ["image_input", "<image>\nRead every value in the table and return it as JSON."],
  ["image_input", "Read the attached screenshot and list every error message it shows."],
  ["expected", "Expected output: a single lowercase word from the category list."],
  ["expected", "The reply must equal the customer's order number and nothing else."],
  ["expected", "Expected result: valid JSON with exactly the four keys above."]
];

describe("classify() on the kinds the corpus cannot cover", () => {
  it("labels image references, image slots and expectations", () => {
    const misses: string[] = [];
    for (const [expected, text] of MULTIMODAL) {
      const got = classifyText(text);
      if (got.kind !== expected) misses.push(`expected ${expected}, got ${got.kind} via ${got.matched} — ${JSON.stringify(text)}`);
    }
    for (const miss of misses) console.log(`  multimodal miss: ${miss}`);
    expect(misses).toEqual([]);
  });

  it("does not invent an expectation from ordinary rule language", () => {
    // `expected` compiles to a check rather than to text, so a false positive here does not
    // mislabel a blok — it invents a check that can fail a publish. These all read like
    // expectations and are ordinary constraints; none of them may come back as `expected`.
    for (const text of [
      "You must respond in JSON only.",
      "The summary should be short.",
      "Always return a category from the list.",
      "Never return an empty string.",
      "Make sure the output is valid JSON."
    ]) {
      expect(classifyText(text).kind, text).not.toBe("expected");
    }
  });

  it("returns a confidence in [0, 1] and a matched id for every heuristic", () => {
    for (const { id } of heuristicPatterns()) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    for (const row of labelled) {
      const got = classifyText(row.text);
      expect(got.confidence).toBeGreaterThanOrEqual(0);
      expect(got.confidence).toBeLessThanOrEqual(1);
      expect(got.matched).not.toBe("");
    }
  });
});
