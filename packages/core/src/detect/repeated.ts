// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { normalise, overlap } from "../cluster/similarity.js";
import { polarityOf } from "../cluster/polarity.js";
import type { Blok } from "../cluster/types.js";
import { REPEAT_OVERLAP_THRESHOLD } from "./constants.js";
import { blokText, makeFinding, opposed, quote, toRange } from "./shared.js";
import type { Finding } from "./types.js";

// ── repeated ─────────────────────────────────────────────────────────────────────────────────
//
// Two bloks that say substantially the same thing. Fires **across** bloks, never inside one
// (decision 6) — a blok with three ranges is not a finding, it is what clustering is for, and
// EPIC-013 shows the range count on the card.
//
// The prototype's version counted a blok's own fragments, which under EPIC-011a's clustering is not
// a defect at all. And a naive port of "overlap ≥ threshold" would never fire, because any two
// bloks over the threshold that share a kind were *already merged into one blok*. What is left —
// and what this reports — is the pair clustering deliberately refused: the same instruction said
// twice in two different registers, once as role context and once as a numbered rule. Those are
// genuinely two places a user has to edit, and nothing else in the product points at them.

export function detectRepeated(bloks: readonly Blok[], source: string): Finding[] {
  const found: Finding[] = [];
  const vocabularies = bloks.map((blok) => normalise(blokText(blok, source)));
  const polarities = bloks.map((blok) => polarityOf(blokText(blok, source)));

  for (let i = 0; i < bloks.length; i++) {
    for (let j = i + 1; j < bloks.length; j++) {
      // A polarity mismatch means these disagree rather than repeat. That is the other detector's
      // finding, and reporting it here as well would put two findings on one problem.
      if (opposed(polarities[i]!, polarities[j]!)) continue;
      if (overlap(vocabularies[i]!, vocabularies[j]!) < REPEAT_OVERLAP_THRESHOLD) continue;
      if (Math.min(vocabularies[i]!.size, vocabularies[j]!.size) < 3) continue;

      const ranges = [...bloks[i]!.ranges, ...bloks[j]!.ranges].map(toRange);
      ranges.sort((a, b) => a.start - b.start);
      found.push(
        makeFinding("repeated", "medium", [bloks[i]!.id, bloks[j]!.id], ranges, {
          message: `Two bloks say the same thing: ${quote(source, ranges[0]!)} and ${quote(source, ranges[ranges.length - 1]!)}. Editing one leaves the other in place.`,
          suggestion: "Keep one of them and delete the other, or join them into one blok."
        })
      );
    }
  }
  return found;
}
