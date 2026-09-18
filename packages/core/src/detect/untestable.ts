// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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

/**
 * The vague phrase this text carries, or `null`.
 *
 * Exported because `rule_without_check` has to skip exactly what this detector claims (EPIC-012b
 * decision 3), and the only way to make the two **mutually exclusive by construction** rather than
 * by convention is to have one predicate over one list. A second copy of this list — or a second
 * matcher over the same list — is how a rule comes to be called unverifiable and told to add a
 * check in the same panel.
 */
export function untestablePhraseIn(text: string): string | null {
  for (const phrase of UNTESTABLE) {
    const match = phrase.test.exec(text);
    if (match !== null) return match[0];
  }
  return null;
}

export function detectUntestable(bloks: readonly Blok[], source: string): Finding[] {
  const found: Finding[] = [];
  for (const blok of bloks) {
    // Only rules can be untestable. A `context` blok describing who the model is was never going to
    // be checked, so calling it untestable is noise.
    if (blok.kind !== "constraint" && blok.kind !== "expected") continue;
    for (const range of blok.ranges) {
      // One finding per range: three vague phrases in one rule is still one vague rule. The first
      // match wins, in file order.
      const phrase = untestablePhraseIn(source.slice(range.start, range.end));
      if (phrase === null) continue;
      found.push(
        makeFinding("untestable", "medium", [blok.id], [toRange(range)], {
          message: `No check can be written against ${JSON.stringify(phrase.trim())} — this rule can never fail visibly.`,
          suggestion: "Replace it with something countable, or add a check that says what good looks like."
        })
      );
    }
  }
  return found;
}
