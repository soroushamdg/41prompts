// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { generatePrompt, NAMED_EDGE_CASES } from "../segment/fixtures/generate.js";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";
import { segment } from "../segment/segment.js";
import { MAX_RULES_WITHOUT_CHECKS } from "./constants.js";
import { detect } from "./detect.js";
import { DETECT_FIXTURES, LIMIT_FIXTURES, NOISY_FIXTURES, QUIET_FIXTURES } from "./fixtures/prompts.js";
import ruleShapesData from "./rule-shapes.json" with { type: "json" };
import type { Finding, FindingKind } from "./types.js";

/**
 * The five kinds that report a **defect**. `rule_without_check` is deliberately not among them.
 *
 * EPIC-012b decision 8: a prompt with no `expected` blok at all is the common case, not an error.
 * That makes the sixth finding the first one in this package that is not a complaint about the
 * prompt — so "nothing is wrong with this prompt" and "this prompt has an unchecked rule" are now
 * two different statements, and the quiet set asserts the first without asserting the second.
 */
const DEFECT_KINDS: readonly FindingKind[] = ["repeated", "contradiction", "untestable", "padding", "too_long"];

function findingsFor(text: string): Finding[] {
  return detect(cluster(segment(text)), text);
}

function describeFinding(source: string, finding: Finding): string {
  const spans = finding.ranges
    .map((range) => JSON.stringify(source.slice(range.start, range.end).replace(/\s+/g, " ").trim().slice(0, 60)))
    .join(" + ");
  return `${finding.severity} ${finding.kind}: ${finding.message} [${spans}]`;
}

describe("must not fire", () => {
  // The set that matters. False positives are this epic's failure mode: a finding somebody
  // disagrees with costs more trust than a finding they never saw, because it teaches them to stop
  // opening the panel. Each of these prompts contains the exact surface feature a detector looks
  // for, used correctly.
  it.each(QUIET_FIXTURES.map((f) => ({ name: f.name, fixture: f })))(
    "reports no defect on $name",
    ({ fixture }) => {
      const found = findingsFor(fixture.text).filter((finding) => DEFECT_KINDS.includes(finding.kind));
      expect(found.map((finding) => describeFinding(fixture.text, finding))).toEqual([]);
    }
  );

  /**
   * The one quiet prompt that legitimately carries an unchecked rule, named so a *second* one is a
   * failure rather than a shrug.
   *
   * `quiet-negation-without-conflict` ends "Always include the pull request number for each
   * change." Nothing checks that, a "must contain" check would, and saying so is the finding
   * working — not a false positive. Ten of the eleven quiet prompts stay completely silent; this
   * one is the exception and it is written down rather than tuned away, because rewording the
   * fixture to dodge the finding would be tuning the test to the answer.
   */
  const QUIET_WITH_AN_UNCHECKED_RULE: ReadonlySet<string> = new Set(["quiet-negation-without-conflict"]);

  it.each(QUIET_FIXTURES.map((f) => ({ name: f.name, fixture: f })))(
    "reports an unchecked rule on $name only where the prompt really has one",
    ({ fixture }) => {
      const found = findingsFor(fixture.text).filter((finding) => finding.kind === "rule_without_check");
      const expected = QUIET_WITH_AN_UNCHECKED_RULE.has(fixture.name) ? 1 : 0;
      expect(found.map((finding) => describeFinding(fixture.text, finding)).length, fixture.name).toBe(expected);
    }
  );
});

describe("must fire", () => {
  const cases: ReadonlyArray<readonly [string, FindingKind]> = [
    ["fires-repeated", "repeated"],
    ["fires-contradiction-across-bloks", "contradiction"],
    ["fires-contradiction-inside-one-blok", "contradiction"],
    ["fires-untestable", "untestable"],
    ["fires-padding", "padding"],
    ["fires-too-long", "too_long"],
    ["fires-rule-without-check", "rule_without_check"]
  ];

  it.each(cases.map(([name, kind]) => ({ name, kind })))("finds a $kind in $name", ({ name, kind }) => {
    const fixture = NOISY_FIXTURES.find((f) => f.name === name)!;
    const found = findingsFor(fixture.text);
    expect(found.map((finding) => finding.kind)).toContain(kind);
  });

  it("finds the antonym contradiction EPIC-011a carried forward, pointing at both ranges", () => {
    // The named case. Token overlap merges "Keep the summary short." and "Keep the summary long."
    // into ONE blok, so a detector that compares bloks can never see it — which is why this one
    // compares sentences.
    const fixture = NOISY_FIXTURES.find((f) => f.name === "fires-contradiction-inside-one-blok")!;
    const found = findingsFor(fixture.text).filter((finding) => finding.kind === "contradiction");

    expect(found).toHaveLength(1);
    const [finding] = found;
    expect(finding!.ranges).toHaveLength(2);
    const spans = finding!.ranges.map((range) => fixture.text.slice(range.start, range.end));
    expect(spans).toContain("Keep the summary short.");
    expect(spans).toContain("Keep the summary long.");
    expect(finding!.message).toContain("short");
    expect(finding!.message).toContain("long");

    // And the clustering really did hide it inside one blok, or this test is not testing what it
    // says it is.
    const bloks = cluster(segment(fixture.text));
    const owning = bloks.filter((blok) =>
      blok.ranges.some((range) => fixture.text.slice(range.start, range.end).includes("summary"))
    );
    expect(owning).toHaveLength(1);
    expect(owning[0]!.ranges.length).toBeGreaterThan(1);
  });

  it("stays quiet on a real contradiction it cannot separate from a false one", () => {
    // A limit, pinned rather than forgotten. "Do not use markdown formatting in your response." and
    // "Format the summary as a markdown bullet list" do contradict each other — and the rule that
    // would catch them is measurably identical to the rule that would fire on
    // `quiet-negation-without-conflict`, where two compatible rules share the noun "change":
    //
    //   markdown  negative/neutral   overlap 0.33   shared inside the negated scope: ["markdown"]
    //   change    negative/positive  overlap 0.25   shared inside the negated scope: ["change"]
    //
    // The difference is what the verbs do to the shared object, which needs parsing this package
    // will not do. Decision 5 ranks the failures and a wrong finding costs more than a missed one,
    // so this stays quiet. Change it only with evidence that separates these two.
    const fixture = LIMIT_FIXTURES.find((f) => f.name === "limit-contradiction-inside-one-range")!;
    const found = findingsFor(fixture.text).filter((finding) => finding.kind === "contradiction");
    expect(found).toEqual([]);
  });
});

describe("the shape of a finding", () => {
  it("names at least one existing blok, and a cross-blok contradiction names two", () => {
    for (const fixture of DETECT_FIXTURES) {
      const bloks = cluster(segment(fixture.text));
      const ids = new Set(bloks.map((blok) => blok.id));
      for (const finding of detect(bloks, fixture.text)) {
        expect(finding.bloks.length, `${fixture.name} ${finding.kind}`).toBeGreaterThanOrEqual(1);
        for (const id of finding.bloks) expect(ids, `${fixture.name} ${finding.kind}`).toContain(id);
      }
    }

    const across = NOISY_FIXTURES.find((f) => f.name === "fires-contradiction-across-bloks")!;
    const contradiction = findingsFor(across.text).find((finding) => finding.kind === "contradiction")!;
    expect(contradiction.bloks).toHaveLength(2);
  });

  it("keeps every range inside the source and pointing at real text", () => {
    for (const fixture of DETECT_FIXTURES) {
      for (const finding of findingsFor(fixture.text)) {
        expect(finding.ranges.length, `${fixture.name} ${finding.kind}`).toBeGreaterThan(0);
        for (const range of finding.ranges) {
          expect(range.start).toBeGreaterThanOrEqual(0);
          expect(range.end).toBeLessThanOrEqual(fixture.text.length);
          expect(range.end).toBeGreaterThan(range.start);
          expect(fixture.text.slice(range.start, range.end).trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("orders findings by severity, then first range, then kind", () => {
    const fixture = NOISY_FIXTURES.find((f) => f.name === "fires-several")!;
    const found = findingsFor(fixture.text);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < found.length; i++) {
      const previous = found[i - 1]!;
      const current = found[i]!;
      const bySeverity = rank[previous.severity] - rank[current.severity];
      if (bySeverity !== 0) {
        expect(bySeverity).toBeLessThan(0);
        continue;
      }
      const byStart = (previous.ranges[0]?.start ?? 0) - (current.ranges[0]?.start ?? 0);
      if (byStart !== 0) expect(byStart).toBeLessThan(0);
    }
    expect(found.length).toBeGreaterThan(2);
  });

  it("gives every finding a content-derived id, unique within a prompt", () => {
    for (const fixture of DETECT_FIXTURES) {
      const found = findingsFor(fixture.text);
      for (const finding of found) expect(finding.id).toMatch(/^find_[0-9a-f]{16}$/);
      expect(new Set(found.map((finding) => finding.id)).size, fixture.name).toBe(found.length);
    }
  });

  it("produces byte-identical findings over 100 runs of every fixture", () => {
    for (const fixture of DETECT_FIXTURES) {
      const first = JSON.stringify(findingsFor(fixture.text));
      for (let run = 0; run < 100; run++) {
        expect(JSON.stringify(findingsFor(fixture.text)), fixture.name).toBe(first);
      }
    }
  });
});

describe("rule_without_check", () => {
  const GENERATED_CASE_COUNT = 1_000;

  it("never produces a finding overlapping an untestable one, over every fixture and 1,000 generated inputs", () => {
    // Decision 3: the two are mutually exclusive **by construction**. The construction is that both
    // read one list through one exported predicate (`untestablePhraseIn`), and that this detector
    // skips a whole range the moment a phrase appears anywhere in it.
    //
    // Asserted as *no overlap at all*, which is stronger than the criterion's "not for the same
    // range" and is the thing a reader would actually notice: never a highlight inside a highlight,
    // one saying no check can be written and the other saying to add one.
    const inputs = [
      ...DETECT_FIXTURES.map((fixture) => ({ name: fixture.name, text: fixture.text })),
      ...SEGMENT_FIXTURES.map((fixture) => ({ name: fixture.name, text: fixture.text })),
      ...NAMED_EDGE_CASES.map(([name, text]) => ({ name, text })),
      ...Array.from({ length: GENERATED_CASE_COUNT }, (_, i) => ({
        name: `seed-${41_000 + i}`,
        text: generatePrompt(41_000 + i)
      }))
    ];

    for (const input of inputs) {
      const found = findingsFor(input.text);
      const vague = found.filter((finding) => finding.kind === "untestable").flatMap((finding) => finding.ranges);
      const unchecked = found
        .filter((finding) => finding.kind === "rule_without_check")
        .flatMap((finding) => finding.ranges);
      for (const left of vague) {
        for (const right of unchecked) {
          const overlaps = left.start < right.end && right.start < left.end;
          expect(overlaps, `${input.name}: ${left.start}..${left.end} and ${right.start}..${right.end}`).toBe(false);
        }
      }
    }
  });

  it("fires beside untestable in one prompt without touching the rule untestable claimed", () => {
    // The named case, in a single fixture: one rule is both JSON-shaped and hedged with "where
    // possible" and belongs to `untestable` alone; the rule beside it belongs here.
    const fixture = NOISY_FIXTURES.find((f) => f.name === "fires-rule-without-check-beside-untestable")!;
    const found = findingsFor(fixture.text);

    const vague = found.filter((finding) => finding.kind === "untestable");
    const unchecked = found.filter((finding) => finding.kind === "rule_without_check");
    expect(vague).toHaveLength(1);
    expect(unchecked).toHaveLength(1);
    expect(fixture.text.slice(vague[0]!.ranges[0]!.start, vague[0]!.ranges[0]!.end)).toBe(
      "Always respond in JSON only where possible."
    );
    expect(fixture.text.slice(unchecked[0]!.ranges[0]!.start, unchecked[0]!.ranges[0]!.end)).toBe(
      "Always include the ticket number."
    );
  });

  it("stays silent on a whole blok when a contradiction claims any one of its ranges", () => {
    // The regression test for a defect self-review found and no fixture reached.
    //
    // "Always respond in JSON only." is stated twice, so clustering makes it one blok with two
    // ranges; the first of those is in a contradiction with "Never respond in JSON", the second is
    // not (0.43 overlap, below the threshold). The guard used to record the silencing by clearing
    // `best` — but on the *first* matching sentence nothing had been recorded yet, so the outer
    // loop's test for a lost `best` was false and the second range set it again. The blok fired,
    // quoting a restatement of a rule the reader was already being told not to believe.
    const fixture = NOISY_FIXTURES.find((f) => f.name === "fires-contradiction-over-a-restated-rule")!;
    const found = findingsFor(fixture.text);

    expect(found.filter((finding) => finding.kind === "contradiction")).toHaveLength(1);
    expect(found.filter((finding) => finding.kind === "rule_without_check")).toEqual([]);

    // And the blok really does own two ranges, only one of them claimed, or this passes for the
    // wrong reason.
    const bloks = cluster(segment(fixture.text));
    const restated = bloks.find(
      (blok) => blok.kind === "constraint" && blok.ranges.length > 1
    );
    expect(restated, "clustering must merge the two statements of the rule").toBeDefined();
    const claimed = found
      .filter((finding) => finding.kind === "contradiction")
      .flatMap((finding) => finding.ranges);
    const overlapping = restated!.ranges.filter((range) =>
      claimed.some((other) => range.start < other.end && other.start < range.end)
    );
    expect(overlapping).toHaveLength(1);
  });

  it("stays silent where an expected blok already covers the rule", () => {
    const fixture = QUIET_FIXTURES.find((f) => f.name === "quiet-rule-with-covering-check")!;
    expect(findingsFor(fixture.text).filter((finding) => finding.kind === "rule_without_check")).toEqual([]);

    // And the covering blok really is an `expected` one, or this passes for the wrong reason.
    const bloks = cluster(segment(fixture.text));
    expect(bloks.map((blok) => blok.kind)).toContain("expected");
    expect(bloks.map((blok) => blok.kind)).toContain("constraint");
  });

  it("stays silent on a corpus prompt where an expected blok covers the rule", () => {
    // The coverage path, exercised on a real prompt rather than only on its own fixture.
    //
    // `expected-output-sheet` states "Always respond in JSON only." — the same sentence that fires
    // this finding in four other corpus prompts — beside "Expected output: JSON only, with no text
    // around it." Both carry EPIC-011a's `json-only` topic key, so the rule is covered and this stays
    // quiet. Worth pinning: before EPIC-013 added it, not one of the 25 corpus prompts contained an
    // `expected` blok at all, so nothing but a synthetic fixture had ever taken this branch.
    const fixture = SEGMENT_FIXTURES.find((f) => f.name === "expected-output-sheet")!;
    const bloks = cluster(segment(fixture.text));
    expect(bloks.map((blok) => blok.kind)).toContain("expected");

    const jsonRule = bloks.find((blok) =>
      blok.kind === "constraint" && blok.ranges.some((r) => fixture.text.slice(r.start, r.end).includes("JSON only"))
    );
    expect(jsonRule, "the fixture must still state the JSON rule as a constraint").toBeDefined();

    const found = findingsFor(fixture.text).filter((finding) => finding.kind === "rule_without_check");
    expect(found.map((finding) => finding.message)).toEqual([]);
  });

  it("is high only for a machine-checkable shape, and medium otherwise", () => {
    // Decision 5, asserted against the data file rather than against a hand-written list, so a new
    // shape cannot quietly arrive at the wrong severity.
    const MACHINE_CHECKABLE = new Set(["valid JSON shape", "one of the allowed values", "word limit", "character limit"]);
    for (const shape of ruleShapesData) {
      const expected = MACHINE_CHECKABLE.has(shape.check) ? "high" : "medium";
      expect(shape.severity, `${shape.id} names ${JSON.stringify(shape.check)}`).toBe(expected);
    }

    // And the severity a finding actually carries follows the shape its suggestion names.
    for (const fixture of [...DETECT_FIXTURES, ...SEGMENT_FIXTURES]) {
      for (const finding of findingsFor(fixture.text)) {
        if (finding.kind !== "rule_without_check") continue;
        const check = /^Add a "(.+)" check\.$/.exec(finding.suggestion ?? "")?.[1];
        expect(check, `${fixture.name}: ${finding.suggestion}`).toBeDefined();
        expect(finding.severity, `${fixture.name}: ${check}`).toBe(MACHINE_CHECKABLE.has(check!) ? "high" : "medium");
      }
    }
  });

  it("every suggestion names a check in ADR-003's plain phrasing", () => {
    // The vocabulary rule, checked where the strings are written rather than only by the grep over
    // apps/web and packages/ui — nothing in this package reaches that script today.
    const ALLOWED = new Set([
      "valid JSON shape",
      "one of the allowed values",
      "word limit",
      "character limit",
      "must contain",
      "must not contain",
      "matches a pattern",
      "refuses to answer"
    ]);
    for (const shape of ruleShapesData) expect(ALLOWED, shape.id).toContain(shape.check);
  });

  it("caps a twenty-rule prompt and counts the rest in the last one shown", () => {
    const fixture = NOISY_FIXTURES.find((f) => f.name === "fires-rule-without-check-capped")!;
    const found = findingsFor(fixture.text).filter((finding) => finding.kind === "rule_without_check");

    expect(found).toHaveLength(MAX_RULES_WITHOUT_CHECKS);
    // Ranked: every one shown is `high`, because twenty rules include machine-checkable ones and
    // those outrank the substring rules.
    expect(found.map((finding) => finding.severity)).toEqual(["high", "high", "high"]);

    // The remainder is stated exactly once, on the finding the reader sees last.
    const withCount = found.filter((finding) => /more rules here have no check either/.test(finding.message));
    expect(withCount).toHaveLength(1);
    expect(withCount[0]!.id).toBe(found.at(-1)!.id);
    expect(withCount[0]!.message).toContain("17 more rules here have no check either.");

    // 20 rules, 3 shown, 17 counted — and every one of the twenty really is a candidate.
    expect(3 + 17).toBe(20);
  });

  it("reports one finding per blok, however many times the rule is stated", () => {
    // `repeated-sentence` says "Always respond in JSON only." four times, which clustering makes one
    // blok with four ranges. One rule, one check, one finding — pointing at all four places.
    const fixture = SEGMENT_FIXTURES.find((f) => f.name === "repeated-sentence")!;
    const found = findingsFor(fixture.text).filter(
      (finding) => finding.kind === "rule_without_check" && finding.message.includes("JSON")
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.bloks).toHaveLength(1);
    expect(found[0]!.ranges.length).toBeGreaterThan(1);
  });
});

describe("the false-positive audit", () => {
  it("reports every finding fired across the 29 corpus fixtures", () => {
    // Not an assertion so much as the report's raw material: the count is printed and every finding
    // listed, so a human can judge each one. The number is asserted only to stop it growing
    // silently — a change that doubles it should have to say so.
    const lines: string[] = [];
    let total = 0;
    let unchecked = 0;
    let uncheckedFixtures = 0;
    for (const fixture of SEGMENT_FIXTURES) {
      const found = findingsFor(fixture.text);
      total += found.length;
      const here = found.filter((finding) => finding.kind === "rule_without_check").length;
      unchecked += here;
      if (here > 0) uncheckedFixtures += 1;
      for (const finding of found) lines.push(`${fixture.name}\t${describeFinding(fixture.text, finding)}`);
    }
    console.log(`false-positive audit: ${total} finding(s) across ${SEGMENT_FIXTURES.length} fixtures`);
    for (const line of lines) console.log(`  ${line}`);
    // Was 20 against a 25-prompt corpus, and stood at exactly 20 when EPIC-013 grew the corpus to 29
    // to pay EPIC-011a's fixture debt. Raised to 25 to restore the headroom the number is for: it
    // exists so a change that floods the panel has to say so, not so that adding a fixture trips it.
    expect(total).toBeLessThanOrEqual(25);

    // EPIC-012b asks for this number by name: how many of the corpus prompts produce the sixth
    // finding at all, because that is the proxy for how often the pitch lands on a real prompt.
    console.log(
      `rule_without_check: ${unchecked} finding(s) across ${uncheckedFixtures} of ${SEGMENT_FIXTURES.length} fixtures`
    );
    expect(unchecked).toBeLessThanOrEqual(20);
    expect(uncheckedFixtures).toBeGreaterThan(0);
  });
});
