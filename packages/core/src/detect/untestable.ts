// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";
import { makeFinding, toRange } from "./shared.js";
import type { Finding } from "./types.js";
import untestableData from "./untestable.json" with { type: "json" };

// ── untestable ───────────────────────────────────────────────────────────────────────────────
//
// A rule stated so vaguely no check could verify it. Biased hard toward silence, because this and
// `padding` are the two most likely to annoy: every entry is a whole phrase rather than a
// suggestive word, and several carry a guard for the case where the phrase is followed by something
// concrete. "A good migration runs in under 30 seconds" is testable and must stay quiet.

const UNTESTABLE = untestableData.map((row) => ({ id: row.id, test: new RegExp(row.pattern, row.flags) }));

export function detectUntestable(bloks: readonly Blok[], source: string): Finding[] {
  const found: Finding[] = [];
  for (const blok of bloks) {
    // Only rules can be untestable. A `context` blok describing who the model is was never going to
    // be checked, so calling it untestable is noise.
    if (blok.kind !== "constraint" && blok.kind !== "expected") continue;
    for (const range of blok.ranges) {
      const text = source.slice(range.start, range.end);
      for (const phrase of UNTESTABLE) {
        const match = phrase.test.exec(text);
        if (match === null) continue;
        found.push(
          makeFinding("untestable", "medium", [blok.id], [toRange(range)], {
            message: `No check can be written against ${JSON.stringify(match[0].trim())} — this rule can never fail visibly.`,
            suggestion: "Replace it with something countable, or add a check that says what good looks like."
          })
        );
        break; // one finding per range: three vague phrases in one rule is still one vague rule
      }
    }
  }
  return found;
}
