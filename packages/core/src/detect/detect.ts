// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";
import { detectContradiction } from "./contradiction.js";
import { detectPadding } from "./padding.js";
import paddingData from "./padding.json" with { type: "json" };
import { detectRepeated } from "./repeated.js";
import { detectTooLong } from "./too-long.js";
import type { Finding, Severity } from "./types.js";
import { detectUntestable } from "./untestable.js";
import untestableData from "./untestable.json" with { type: "json" };

/**
 * Findings: the visible value of the decompiler.
 *
 * Every finding has to be one the reader looks at and thinks "that's true, and I hadn't noticed".
 * **False positives are the failure mode** (decision 5): a finding somebody disagrees with costs
 * more trust than a finding they never saw, because it teaches them to stop opening the panel. When
 * a rule is ambiguous, this stays quiet.
 *
 * Nothing here blocks and nothing is auto-fixed (decision 9). Blocking belongs to publishing.
 */
export function detect(bloks: readonly Blok[], source: string): Finding[] {
  const found: Finding[] = [
    ...detectRepeated(bloks, source),
    ...detectContradiction(bloks, source),
    ...detectUntestable(bloks, source),
    ...detectPadding(bloks, source),
    ...detectTooLong(bloks, source)
  ];

  // Decision 8. Sorted by severity, then by where the first highlight is, then by kind — so the
  // panel reads top-down in the order somebody would work through it, and two runs never disagree.
  const severityRank: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2 };
  found.sort((left, right) => {
    if (severityRank[left.severity] !== severityRank[right.severity]) {
      return severityRank[left.severity] - severityRank[right.severity];
    }
    const leftStart = left.ranges[0]?.start ?? 0;
    const rightStart = right.ranges[0]?.start ?? 0;
    if (leftStart !== rightStart) return leftStart - rightStart;
    if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return found;
}

/** Every committed pattern in this module, for the pattern-safety test. */
export function detectPatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return [
    ...untestableData.map((row) => ({ id: `untestable:${row.id}`, pattern: row.pattern, flags: row.flags })),
    ...paddingData.map((row) => ({ id: `padding:${row.id}`, pattern: row.pattern, flags: row.flags }))
  ];
}
