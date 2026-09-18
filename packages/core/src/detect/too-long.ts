// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";
import { MAX_BLOK_WORDS, MAX_PROMPT_WORDS } from "./constants.js";
import { makeFinding, toRange, wordCount } from "./shared.js";
import type { Finding } from "./types.js";

// ── too_long ─────────────────────────────────────────────────────────────────────────────────
//
// One blok carrying more than one instruction, or a prompt long enough that its length is itself
// worth mentioning. Both thresholds are exported and revisitable once EPIC-084 has real numbers.

export function detectTooLong(bloks: readonly Blok[], source: string): Finding[] {
  const found: Finding[] = [];

  for (const blok of bloks) {
    // The longest range, not the sum of them. A blok's ranges are restatements of one instruction,
    // so a rule said four times is not four times too long — it is one rule, said four times, which
    // is `repeated`'s business and not this detector's. Summing them put ten `too_long` findings on
    // the `wall-of-text` fixture, every one of them counting the same sentence four times.
    if (blok.ranges.length === 0) continue;
    const words = Math.max(...blok.ranges.map((range) => wordCount(source.slice(range.start, range.end))), 0);
    if (words <= MAX_BLOK_WORDS) continue;
    found.push(
      makeFinding("too_long", "low", [blok.id], blok.ranges.map(toRange), {
        message: `${words} words in one blok. A failure here points at all of it rather than at the part that broke.`,
        suggestion: "Split it so each blok carries one instruction."
      })
    );
  }

  const promptWords = wordCount(source);
  // `detect()` is a public export taking arbitrary bloks, so a blok with no ranges is a shape it can
  // be handed — and mapping over every blok to build a list that is then sliced to one threw a
  // TypeError on a range it was about to discard. Found in review.
  const firstRange = bloks.find((blok) => blok.ranges.length > 0)?.ranges[0];
  if (promptWords > MAX_PROMPT_WORDS && firstRange !== undefined) {
    const ranges = [toRange(firstRange)];
    found.push(
      makeFinding("too_long", "low", bloks.map((blok) => blok.id), ranges, {
        message: `${promptWords} words in the whole prompt. Every one of them is sent on every call.`,
        suggestion: "Look for the bloks nothing depends on."
      })
    );
  }

  return found;
}
