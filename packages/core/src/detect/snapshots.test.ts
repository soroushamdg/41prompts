// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { SEGMENT_FIXTURES } from "../segment/fixtures/index.js";
import { segment } from "../segment/segment.js";
import { heuristicSummariser } from "../summarise/heuristic.js";
import { detect } from "./detect.js";
import { DETECT_FIXTURES } from "./fixtures/prompts.js";
import type { Finding } from "./types.js";

function render(name: string, describes: string, source: string, findings: readonly Finding[]): string {
  // REUSE-IgnoreStart -- the header written into every generated snapshot, not a licence for this file.
  const header = [
    "# SPDX-FileCopyrightText: 2026 41Prompts Inc.",
    "# SPDX-License-Identifier: Apache-2.0",
    "#",
    `# ${name} — ${describes}`,
    "#",
    "# Generated. Regenerate with:  pnpm --filter @41prompts/core exec vitest run -u",
    `# ${findings.length} finding(s)`,
    ""
  ];
  // REUSE-IgnoreEnd
  const body = findings.flatMap((finding) => [
    `[${finding.severity}] ${finding.kind} ${finding.id} bloks=${finding.bloks.length}`,
    `      ${finding.message}`,
    ...(finding.suggestion === undefined ? [] : [`      -> ${finding.suggestion}`]),
    ...finding.ranges.map(
      (range) => `      ${range.start}..${range.end} ${JSON.stringify(source.slice(range.start, range.end))}`
    )
  ]);
  return `${[...header, ...body].join("\n")}\n`;
}

describe("committed finding snapshots", () => {
  it.each(DETECT_FIXTURES.map((fixture) => ({ name: fixture.name, fixture })))(
    "detects $name identically to its committed snapshot",
    async ({ fixture }) => {
      const findings = detect(cluster(segment(fixture.text)), fixture.text);
      await expect(render(fixture.name, fixture.describes, fixture.text, findings)).toMatchFileSnapshot(
        `./fixtures/snapshots/${fixture.name}.snap.txt`
      );
    }
  );

  it("runs the prototype's sample end to end: segment, cluster, summarise, detect", async () => {
    // The whole pipeline on one prompt, so a change anywhere in Stage 1 shows up in one diff. The
    // report compares these findings against the prototype's own nine.
    const fixture = SEGMENT_FIXTURES.find((f) => f.name === "support-email-router")!;
    const segments = segment(fixture.text);
    const bloks = cluster(segments);
    const findings = detect(bloks, fixture.text);

    const lines = [
      // REUSE-IgnoreStart
      "# SPDX-FileCopyrightText: 2026 41Prompts Inc.",
      "# SPDX-License-Identifier: Apache-2.0",
      "#",
      "# The decompiler prototype's own sample, end to end. Generated; regenerate with vitest -u.",
      // REUSE-IgnoreEnd
      `# ${segments.length} segments -> ${bloks.length} bloks -> ${findings.length} findings`,
      "",
      "## bloks",
      ...bloks.map(
        (blok) =>
          `${blok.kind.padEnd(11)} ranges=${blok.ranges.length}  ${JSON.stringify(
            heuristicSummariser.summarise(blok, fixture.text).text
          )}`
      ),
      "",
      "## findings",
      ...findings.flatMap((finding) => [
        `[${finding.severity}] ${finding.kind}`,
        `      ${finding.message}`,
        ...finding.ranges.map(
          (range) => `      ${range.start}..${range.end} ${JSON.stringify(fixture.text.slice(range.start, range.end))}`
        )
      ])
    ];
    await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot("./fixtures/snapshots/prototype-sample-end-to-end.snap.txt");
  });
});
