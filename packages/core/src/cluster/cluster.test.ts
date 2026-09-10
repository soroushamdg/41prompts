// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { checkPattern } from "../pattern-shape.js";
import { heuristicPatterns } from "../classify/classify.js";
import { segment } from "../segment/segment.js";
import { clusterPatterns, cluster, MERGE_OVERLAP_THRESHOLD } from "./cluster.js";
import { CLUSTER_FIXTURES } from "./fixtures/prompts.js";
import type { Blok } from "./types.js";

function renderSnapshot(name: string, describes: string, source: string, bloks: readonly Blok[]): string {
  // REUSE-IgnoreStart -- the header written into every generated snapshot, not a licence for this file.
  const header = [
    "# SPDX-FileCopyrightText: 2026 <legal entity>",
    "# SPDX-License-Identifier: Apache-2.0",
    "#",
    `# ${name} — ${describes}`,
    "#",
    "# Generated. Regenerate with:  pnpm --filter @41prompts/core exec vitest run -u",
    `# ${bloks.length} blok(s), ${bloks.filter((b) => b.ranges.length > 1).length} of them multi-range`,
    ""
  ];
  // REUSE-IgnoreEnd
  const body = bloks.flatMap((blok, index) => [
    `[${index}] ${blok.id} ${blok.kind} ranges=${blok.ranges.length}`,
    ...blok.ranges.map((range) => `      ${range.start}..${range.end} ${JSON.stringify(source.slice(range.start, range.end))}`)
  ]);
  return `${[...header, ...body].join("\n")}\n`;
}

describe("cluster()", () => {
  it.each(CLUSTER_FIXTURES.map((fixture) => ({ name: fixture.name, fixture })))(
    "clusters $name identically to its committed snapshot",
    async ({ fixture }) => {
      const bloks = cluster(segment(fixture.text));
      await expect(renderSnapshot(fixture.name, fixture.describes, fixture.text, bloks)).toMatchFileSnapshot(
        `./fixtures/snapshots/${fixture.name}.snap.txt`
      );
    }
  );

  it("puts a rule stated twice, paragraphs apart, in one blok with two non-adjacent ranges", () => {
    // The shape the product is named for. Decision 9: a rule in the opening paragraph and repeated
    // in a numbered list at the end is one blok with two ranges, and nothing about it is adjacent.
    const fixture = CLUSTER_FIXTURES.find((f) => f.name === "multi-range")!;
    const bloks = cluster(segment(fixture.text));
    const multi = bloks.filter((blok) => blok.ranges.length > 1);

    expect(multi).toHaveLength(1);
    const [first, second] = multi[0]!.ranges;
    expect(fixture.text.slice(first!.start, first!.end)).toBe(
      "Always respond in JSON only, with no extra text before or after."
    );
    expect(fixture.text.slice(second!.start, second!.end)).toBe(
      "3. Always respond in JSON only, with no extra text before or after."
    );
    // Non-adjacent: there is real text between the two ranges, not just a newline.
    expect(second!.start - first!.end).toBeGreaterThan(100);
    expect(multi[0]!.kind).toBe("constraint");
  });

  it("gives every blok its ranges as an array, even when there is exactly one", () => {
    // Rule 5 and decision 6, checked at run time. The type-level half of this criterion is in
    // `ranges-are-plural.ts`, which stops compiling if a bare range is ever assignable.
    for (const fixture of CLUSTER_FIXTURES) {
      for (const blok of cluster(segment(fixture.text))) {
        expect(Array.isArray(blok.ranges), `${fixture.name} ${blok.id}`).toBe(true);
        expect(blok.ranges.length).toBeGreaterThan(0);
      }
    }
    // And specifically on the fixture built so that every blok has exactly one range: an array of
    // one is still an array, which is the whole point of the rule.
    const single = cluster(segment(CLUSTER_FIXTURES.find((f) => f.name === "single-range-only")!.text));
    expect(single.every((blok) => blok.ranges.length === 1)).toBe(true);
    expect(single.every((blok) => Array.isArray(blok.ranges))).toBe(true);
  });

  it("gives every blok a content-derived id, unique across the whole corpus", () => {
    const ids = new Set<string>();
    for (const fixture of CLUSTER_FIXTURES) {
      const bloks = cluster(segment(fixture.text));
      for (const blok of bloks) {
        expect(blok.id).toMatch(/^blok_[0-9a-f]{16}$/);
        ids.add(blok.id);
      }
      // Within one prompt, ids must never collide: the id covers each range's offsets, and two
      // bloks in one prompt cannot share a first range.
      expect(new Set(bloks.map((b) => b.id)).size, `${fixture.name} has colliding blok ids`).toBe(bloks.length);
    }
    expect(ids.size).toBeGreaterThan(0);
  });

  it("produces byte-identical bloks over 100 runs of every fixture", () => {
    for (const fixture of CLUSTER_FIXTURES) {
      const first = JSON.stringify(cluster(segment(fixture.text)));
      for (let run = 0; run < 100; run++) {
        expect(JSON.stringify(cluster(segment(fixture.text))), fixture.name).toBe(first);
      }
    }
  });

  it("exposes the merge threshold as a named constant rather than a literal", () => {
    expect(MERGE_OVERLAP_THRESHOLD).toBe(0.6);
  });
});

describe("committed patterns (decision 4 and EPIC-010 decision 7)", () => {
  it("compiles every heuristic and topic pattern and rejects nested quantifiers", () => {
    // The patterns that decide a kind, a topic and a polarity are data now, so the source-scanning
    // check EPIC-010 used cannot see them. Every one of them goes through the same detector.
    const defects: string[] = [];
    for (const { id, pattern, flags } of [...heuristicPatterns(), ...clusterPatterns()]) {
      for (const defect of checkPattern(pattern, flags)) {
        defects.push(`${id}: ${defect.rule} — ${defect.detail}`);
      }
    }
    expect(defects).toEqual([]);
  });
});
