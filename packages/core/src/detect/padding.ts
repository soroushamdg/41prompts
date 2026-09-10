// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";
import paddingData from "./padding.json" with { type: "json" };
import { makeFinding, toRange } from "./shared.js";
import type { Finding } from "./types.js";

// ── padding ──────────────────────────────────────────────────────────────────────────────────
//
// Text that costs tokens and carries no instruction. Same bias toward silence, and one specific
// guard: it does not fire inside an `example` blok, because "please" in quoted example input is the
// customer's word rather than the author's padding.

const PADDING = paddingData.map((row) => ({
  id: row.id,
  quote: row.quote,
  test: new RegExp(row.pattern, row.flags),
  // A phrase is only padding when the prompt is *asserting* it. "Never mention that you are an AI
  // model" contains "you are an AI model" as the thing the rule forbids saying — flagging it as
  // padding would tell the author to delete the subject of their own rule. Found in the audit.
  unless: "unless" in row ? new RegExp((row as { unless: string }).unless, row.flags) : null
}));

export function detectPadding(bloks: readonly Blok[], source: string): Finding[] {
  const found: Finding[] = [];
  for (const blok of bloks) {
    if (blok.kind === "example") continue;
    for (const range of blok.ranges) {
      const text = source.slice(range.start, range.end);
      for (const phrase of PADDING) {
        if (!phrase.test.test(text)) continue;
        if (phrase.unless !== null && phrase.unless.test(text)) continue;
        found.push(
          makeFinding("padding", "low", [blok.id], [toRange(range)], {
            message: `${JSON.stringify(phrase.quote)} costs tokens and changes nothing about the output.`,
            suggestion: "Delete it."
          })
        );
        break;
      }
    }
  }
  return found;
}
