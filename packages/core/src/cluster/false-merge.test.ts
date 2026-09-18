// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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

  it("keeps a short rule from swallowing a long paragraph that contains its words", () => {
    // Trip wire: MAX_VOCABULARY_RATIO. `overlap()` divides by the smaller vocabulary, so a
    // three-token rule whose every word appears somewhere in a forty-word paragraph scores 1.0.
    // Found in self-review; the minimum token count does not help, because the smaller side still
    // has two tokens.
    const shortRule = bloks.find((b) => text(b) === "Always use YAML format.");
    const paragraph = bloks.find((b) => text(b).includes("audit trail"));

    expect(shortRule, "no blok owns the short YAML rule").toBeDefined();
    expect(paragraph, "no blok owns the audit-trail paragraph").toBeDefined();
    expect(shortRule!.id).not.toBe(paragraph!.id);
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

describe("the polarity-order fixture", () => {
  const fixture = CLUSTER_FIXTURES.find((f) => f.name === "polarity-order")!;
  const bloks = cluster(segment(fixture.text));
  const text = (blok: { ranges: readonly { start: number; end: number }[] }): string =>
    blok.ranges.map((range) => fixture.text.slice(range.start, range.end)).join("\n");

  it("never lets a forbidding rule join a blok a neutral fragment opened", () => {
    // Trip wire: the polarity guard consulting every fragment rather than only the group's first.
    // Found in self-review, and reachable only by ordering the fragments so the guard had nothing to
    // disagree with when the second one arrived.
    const negative = bloks.find((b) => text(b).includes("Never reply"));
    expect(negative, "no blok owns the forbidding rule").toBeDefined();
    expect(negative!.ranges).toHaveLength(1);
    expect(text(negative!)).not.toContain("Always reply");
    expect(text(negative!)).not.toContain("Reply in French.");
  });

  it("still merges the neutral rule with its own restatement", () => {
    // The other half, and the reason this is a separate fixture: the guard has to stop a
    // contradiction without also refusing an ordinary restatement.
    const merged = bloks.filter((blok) => blok.ranges.length > 1);
    expect(merged).toHaveLength(1);
    expect(text(merged[0]!)).toBe("Reply in French.\nAlways reply in French, every time.");
  });
});
