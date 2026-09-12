// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { blokHash } from "./hash.js";
import type { Compiled, CompiledSpan, PromptBlok } from "./types.js";

/**
 * Put one span back under the compiler: recompile it from its blok, and return it to `"compiled"`.
 *
 * ADR-003's "Update from blok". **The only way back, and there is no merge** (decision 8) — whatever
 * was typed into the span is replaced by what the blok says, in full.
 *
 * ## The epic's signature could not work
 *
 * The epic writes `updateFromBlok(compiled, blokId)`. `Compiled` holds hashes, not blok text, so
 * there is nothing there to recompile *from*; the blok set is a required argument. Recorded in the
 * report as a correction rather than a preference.
 *
 * ## "Nothing else moves", precisely
 *
 * No other span's **text, hash or state** changes. Later spans' *offsets* necessarily shift whenever
 * this span's length changes — that is true of `editSpan` too, and of any edit to a string. The
 * stronger reading would only be satisfiable by padding, which would put characters in the prompt
 * that no blok wrote.
 */
export function updateFromBlok(compiled: Compiled, bloks: readonly PromptBlok[], blokId: string): Compiled {
  const index = compiled.spans.findIndex((span) => span.blokId === blokId);
  if (index === -1) {
    throw new Error(`updateFromBlok: no span for blok ${JSON.stringify(blokId)}; there is nothing to update`);
  }

  const blok = bloks.find((candidate) => candidate.id === blokId);
  if (blok === undefined) {
    throw new Error(`updateFromBlok: blok ${JSON.stringify(blokId)} is not in this blok set`);
  }
  if (blok.kind === "expected") {
    throw new Error(
      `updateFromBlok: blok ${JSON.stringify(blokId)} is now an expected blok, which compiles to a check and no ` +
        `text. Removing its span changes which bloks emit at all, so that is a compile, not an update.`
    );
  }

  const span = compiled.spans[index]!;
  const delta = blok.text.length - (span.textEnd - span.start);
  const text = compiled.text.slice(0, span.start) + blok.text + compiled.text.slice(span.textEnd);

  const spans: CompiledSpan[] = compiled.spans.map((other, i) => {
    if (i < index) return other;
    if (i === index) {
      return {
        ...other,
        textEnd: other.textEnd + delta,
        end: other.end + delta,
        hash: blokHash(blok),
        state: "compiled" as const
      };
    }
    return { ...other, start: other.start + delta, textEnd: other.textEnd + delta, end: other.end + delta };
  });

  return { ...compiled, text, spans };
}
