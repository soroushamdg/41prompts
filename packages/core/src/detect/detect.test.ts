// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";
import { segment } from "../segment/segment.js";
import { detect } from "./detect.js";
import { DETECT_FIXTURES, LIMIT_FIXTURES, NOISY_FIXTURES, QUIET_FIXTURES } from "./fixtures/prompts.js";
import type { Finding, FindingKind } from "./types.js";

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
    "stays silent on $name",
    ({ fixture }) => {
      const found = findingsFor(fixture.text);
      expect(found.map((finding) => describeFinding(fixture.text, finding))).toEqual([]);
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
    ["fires-too-long", "too_long"]
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

describe("the false-positive audit", () => {
  it("reports every finding fired across the 25 EPIC-010 fixtures", () => {
    // Not an assertion so much as the report's raw material: the count is printed and every finding
    // listed, so a human can judge each one. The number is asserted only to stop it growing
    // silently — a change that doubles it should have to say so.
    const lines: string[] = [];
    let total = 0;
    for (const fixture of SEGMENT_FIXTURES) {
      const found = findingsFor(fixture.text);
      total += found.length;
      for (const finding of found) lines.push(`${fixture.name}\t${describeFinding(fixture.text, finding)}`);
    }
    console.log(`false-positive audit: ${total} finding(s) across ${SEGMENT_FIXTURES.length} fixtures`);
    for (const line of lines) console.log(`  ${line}`);
    expect(total).toBeLessThanOrEqual(20);
  });
});
