// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { SEGMENT_FIXTURES } from "./fixtures/index.js";
import { checkSegmentInvariants } from "./invariants.js";
import { segment } from "./segment.js";
import type { Segment, SegmentFixture } from "./types.js";

/**
 * The committed snapshot format.
 *
 * Plain text, one segment per line, `index start end` then the segment's text as a JSON string
 * so every newline, tab and lone surrogate is visible and unambiguous. A rule change shows up in
 * a PR as moved offsets on the lines it actually moved, which is the whole point of committing
 * these: "adding a rule changes exactly the snapshots it should" is only checkable if a human
 * can read the change.
 *
 * The SPDX header lives inside the snapshot body rather than in a `.license` sidecar, so `reuse
 * lint` is satisfied without adding 25 files or editing `REUSE.toml`.
 */
function renderSnapshot(fixture: SegmentFixture, segments: readonly Segment[]): string {
  // REUSE-IgnoreStart -- the two lines below are the *snapshot's* header, written into every
  // generated file, not a second licence declaration for this source file.
  const header = [
    "# SPDX-FileCopyrightText: 2026 41Prompts Inc.",
    "# SPDX-License-Identifier: Apache-2.0",
    "#",
    `# ${fixture.name} — ${fixture.describes}`,
    "#",
    "# Generated. Regenerate with:  pnpm --filter @41prompts/core exec vitest run -u",
    `# source: ${fixture.text.length} code units, ${segments.length} segment(s)`,
    ""
  ];
  // REUSE-IgnoreEnd
  const body = segments.map((s, i) => `${i} ${s.start} ${s.end} ${JSON.stringify(s.text)}`);
  return `${[...header, ...body].join("\n")}\n`;
}

describe("the committed fixture corpus", () => {
  it("holds exactly 29 prompts with unique names", () => {
    // 25 from EPIC-010, plus the four EPIC-013 added to pay EPIC-011a's fixture debt: two
    // multimodal prompts and two written as expectations, for the three blok kinds the original
    // corpus never contained.
    expect(SEGMENT_FIXTURES).toHaveLength(29);
    expect(new Set(SEGMENT_FIXTURES.map((f) => f.name)).size).toBe(29);
  });

  it("covers every case the epic names", () => {
    const named = new Set(SEGMENT_FIXTURES.map((f) => f.name));
    for (const required of [
      "fenced-json-schema",
      "xml-instruction-tags",
      "numbered-rules",
      "markdown-heavy",
      "wall-of-text",
      "crlf-line-endings",
      "tab-indented",
      "emoji-and-combining",
      "right-to-left",
      "byte-order-mark",
      "nearly-empty",
      "whitespace-only"
    ]) {
      expect(named, `missing required fixture ${required}`).toContain(required);
    }
    // "one single 4,000-character wall of text" is a size, not just a name.
    expect(SEGMENT_FIXTURES.find((f) => f.name === "wall-of-text")!.text.length).toBeGreaterThanOrEqual(4_000);
  });

  it.each(SEGMENT_FIXTURES.map((fixture) => ({ name: fixture.name, fixture })))(
    "segments $name identically to its committed snapshot",
    async ({ fixture }) => {
      const segments = segment(fixture.text);
      expect(checkSegmentInvariants(fixture.text, segments)).toEqual([]);
      await expect(renderSnapshot(fixture, segments)).toMatchFileSnapshot(
        `./fixtures/snapshots/${fixture.name}.snap.txt`
      );
    }
  );

  it("reproduces the decompiler prototype's own output on its sample prompt", () => {
    // docs/design/41prompts-decompiler.html's `segment()` run against its own SAMPLE produces
    // these 15 spans. Ported rules must not move a boundary the prototype already got right —
    // this is the parity check behind the report's deviation list.
    const fixture = SEGMENT_FIXTURES.find((f) => f.name === "support-email-router")!;
    const offsets = segment(fixture.text).map((s) => [s.start, s.end]);
    expect(offsets).toEqual([
      [0, 157],
      [159, 232],
      [234, 240],
      [241, 352],
      [353, 435],
      [436, 478],
      [479, 551],
      [552, 616],
      [617, 677],
      [679, 809],
      [811, 936],
      [938, 1007],
      [1009, 1132],
      [1134, 1225],
      [1227, 1294]
    ]);
  });

  it("segments a CRLF prompt into the same text as the same prompt with LF", () => {
    const crlfPrompt = SEGMENT_FIXTURES.find((f) => f.name === "crlf-line-endings")!.text;
    const lfPrompt = crlfPrompt.replace(/\r\n/g, "\n");

    const crlfTexts = segment(crlfPrompt).map((s) => s.text.replace(/\r\n/g, "\n"));
    expect(crlfTexts).toEqual(segment(lfPrompt).map((s) => s.text));
  });
});
