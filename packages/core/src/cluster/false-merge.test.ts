// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { segment } from "../segment/segment.js";
import { cluster } from "./cluster.js";
import { CLUSTER_FIXTURES } from "./fixtures/prompts.js";

const falseMerge = CLUSTER_FIXTURES.find((f) => f.name === "false-merge")!;

/**
 * The false-merge fixture, checked one temptation at a time.
 *
 * Criterion 5 asks not just that these stay apart, but that the test says **which threshold or
 * topic key would have to change to break it** — so each case names its own trip wire. That is the
 * difference between a test that guards a behaviour and a test that merely records one: when
 * somebody widens a topic key in six months, the failure should tell them what they just did.
 */
describe("the false-merge fixture", () => {
  const bloks = cluster(segment(falseMerge.text));
  const rangesOf = (needle: string): number =>
    bloks.filter((blok) => blok.ranges.some((range) => falseMerge.text.slice(range.start, range.end).includes(needle)))
      .flatMap((blok) => blok.ranges).length;

  it("keeps three unrelated rules apart even though each mentions a field", () => {
    // Trip wire: a topic key whose pattern matches a bare `fields?`. The prototype has exactly
    // that — `json-shape`, `/\b(fields?|schema|category|priority|needs_human)\b/i` — and it fuses
    // "keep the summary field short", "set the priority field to high" and "be professional in the
    // summary field" into one blok. Adding any key that matches a noun this common re-creates it.
    const summaryShort = bloks.find((b) => text(b).includes("reasonably short"));
    const priorityHigh = bloks.find((b) => text(b).includes("priority field to high"));
    const professional = bloks.find((b) => text(b).includes("professional and friendly"));

    expect(summaryShort, "no blok owns the summary-length rule").toBeDefined();
    expect(new Set([summaryShort!.id, priorityHigh!.id, professional!.id]).size).toBe(3);
  });

  it("keeps a contradiction apart even though its token overlap clears the threshold", () => {
    // Trip wire: MERGE_OVERLAP_THRESHOLD, or the polarity guard. These two share the normalised
    // tokens {respond, json} out of three, which is 0.667 — over the 0.6 threshold — and both
    // classify as `constraint`. Only the polarity guard keeps them apart, and if it is removed
    // this merges a rule with its own contradiction and hides it from EPIC-012a.
    const always = bloks.find((b) => text(b).includes("Always respond in JSON only."));
    const never = bloks.find((b) => text(b).includes("Never respond in JSON"));

    expect(always, "no blok owns the positive JSON rule").toBeDefined();
    expect(never, "no blok owns the negative JSON rule").toBeDefined();
    expect(always!.id).not.toBe(never!.id);
  });

  it("keeps a one-token pair apart even though its overlap is a perfect 1.0", () => {
    // Trip wire: MIN_OVERLAP_TOKENS. Normalisation drops words of three characters or fewer, so
    // "Use markdown." reduces to the single token {markdown}. One shared token out of one scores
    // 1.0 — the highest the measure can produce, on the least evidence it can have. Lower the
    // minimum to 1 and a heading-style rule gets filed inside a "use markdown" blok.
    const useMarkdown = bloks.find((b) => text(b).includes("Use markdown."));
    const headings = bloks.find((b) => text(b).includes("sentence case"));

    expect(useMarkdown, "no blok owns the use-markdown rule").toBeDefined();
    expect(headings, "no blok owns the heading-case rule").toBeDefined();
    expect(useMarkdown!.id).not.toBe(headings!.id);
  });

  it("merges nothing at all in this fixture", () => {
    // The blunt version of the three tests above, which is what makes an unexpected merge
    // anywhere in this prompt fail loudly rather than only in the case somebody thought of.
    const merged = bloks.filter((blok) => blok.ranges.length > 1);
    expect(
      merged.map((blok) => `${blok.kind} ${blok.ranges.map((r) => `${r.start}..${r.end}`).join(" + ")}`),
      "every rule in this prompt is said once, so no blok may own more than one range"
    ).toEqual([]);
    expect(rangesOf("markdown")).toBeGreaterThan(0);
  });

  function text(blok: { ranges: readonly { start: number; end: number }[] }): string {
    return blok.ranges.map((range) => falseMerge.text.slice(range.start, range.end)).join("\n");
  }
});
