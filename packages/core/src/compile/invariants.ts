// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { InvariantViolation } from "../segment/invariants.js";
import type { Compiled, PromptBlok } from "./types.js";

/**
 * **The span-tiling invariant. Written before the compiler, on purpose.**
 *
 * Every later epic depends on this silently. EPIC-021b paints a compiled pane by walking spans and
 * assuming they cover the text; EPIC-032 attributes a failing check back to the blok whose span
 * contains an offset; EPIC-040 diffs two compiled prompts span by span; EPIC-050 freezes the shape
 * into a public artifact. Each of those is correct **only if** the spans tile the text exactly — no
 * gaps, no overlaps, starting at 0 and ending at `text.length`.
 *
 * A gap is not a crash. It is a character of the compiled prompt that belongs to no blok, so the
 * pane renders it unattributed, the failure points at the wrong rule, and the diff drifts by one.
 * Nothing throws; the product is just quietly wrong about whose text it is showing. That is the
 * failure mode this file exists to make loud, and it is why it was committed before `compile.ts`
 * existed — the same sequencing that put EPIC-011a's false-merge fixture before the merge rule.
 *
 * Exported, not internal, for the same reason `checkSegmentInvariants` and `checkBlokInvariants`
 * are: any later epic that splits, joins, reorders or re-anchors spans can check itself against
 * this list instead of inventing its own idea of a well-formed compiled prompt.
 *
 * Returns an empty array when everything holds.
 */
export function checkCompiledInvariants(compiled: Compiled, bloks?: readonly PromptBlok[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { text, spans } = compiled;

  // The degenerate case, asserted rather than assumed: no bloks compiles to no text and no spans,
  // and the tiling holds vacuously. A compiler that emitted a stray separator for an empty prompt
  // would pass every other rule here.
  if (spans.length === 0) {
    if (text !== "") {
      violations.push({ rule: "empty-compiles-to-empty", detail: `no spans but text is ${text.length} long` });
    }
    return finishWithBloks(violations, compiled, bloks);
  }

  const seen = new Set<string>();
  let previousEnd = 0;

  for (const [index, span] of spans.entries()) {
    const at = `span ${index} (${span.blokId})`;

    if (seen.has(span.blokId)) {
      violations.push({ rule: "one-span-per-blok", detail: `${at}: this blok already owns a span` });
    }
    seen.add(span.blokId);

    if (!Number.isInteger(span.start) || !Number.isInteger(span.textEnd) || !Number.isInteger(span.end)) {
      violations.push({ rule: "offsets-are-integers", detail: `${at}: ${span.start}..${span.textEnd}..${span.end}` });
      continue;
    }

    // `start <= textEnd <= end`. `textEnd` may equal `start` (a blok whose text is empty) and may
    // equal `end` (no separator, which is what the last span looks like if that rule ever changes).
    if (span.start > span.textEnd || span.textEnd > span.end) {
      violations.push({
        rule: "text-then-separator",
        detail: `${at}: expected start <= textEnd <= end, got ${span.start} <= ${span.textEnd} <= ${span.end}`
      });
    }

    if (span.start < 0 || span.end > text.length) {
      violations.push({ rule: "offsets-within-the-text", detail: `${at}: ${span.start}..${span.end} of ${text.length}` });
    }

    // The tiling itself, as one rule rather than three: each span starts exactly where the previous
    // one ended, the first at 0, and — checked after the loop — the last at `text.length`.
    if (span.start !== previousEnd) {
      violations.push({
        rule: "spans-tile-the-text",
        detail:
          index === 0
            ? `${at}: first span starts at ${span.start}, not 0`
            : `${at}: starts at ${span.start} but the previous span ended at ${previousEnd}` +
              (span.start > previousEnd ? " — a gap belongs to no blok" : " — an overlap belongs to two")
      });
    }
    previousEnd = span.end;

    if (span.state !== "compiled" && span.state !== "edited by hand") {
      violations.push({ rule: "known-state", detail: `${at}: unknown state ${String(span.state)}` });
    }
  }

  if (previousEnd !== text.length) {
    violations.push({
      rule: "spans-tile-the-text",
      detail: `last span ends at ${previousEnd}, text is ${text.length} long — the remainder belongs to no blok`
    });
  }

  return finishWithBloks(violations, compiled, bloks);
}

/**
 * The rules that need the blok set as well as the compiled prompt.
 *
 * Separate because `checkCompiledInvariants(compiled)` has to be usable on its own: EPIC-050 will
 * validate an artifact read back from R2, where the compiled prompt is the whole of what there is.
 */
function finishWithBloks(
  violations: InvariantViolation[],
  compiled: Compiled,
  bloks: readonly PromptBlok[] | undefined
): InvariantViolation[] {
  if (bloks === undefined) return violations;

  const byId = new Map(bloks.map((blok) => [blok.id, blok]));
  const spanIds = new Set(compiled.spans.map((span) => span.blokId));

  for (const span of compiled.spans) {
    const blok = byId.get(span.blokId);
    if (blok === undefined) {
      violations.push({ rule: "every-span-names-a-blok", detail: `span ${span.blokId}: no such blok` });
      continue;
    }
    if (blok.kind === "expected") {
      violations.push({
        rule: "expected-bloks-emit-no-text",
        detail: `span ${span.blokId}: an expected blok compiles to a check, never to a span`
      });
    }
    // Only a `compiled` span is claimed to be the blok's text. A span edited by hand is *supposed*
    // to differ — that difference is the feature, and `drift()` is what reports it.
    if (span.state === "compiled") {
      const emitted = compiled.text.slice(span.start, span.textEnd);
      if (emitted !== blok.text) {
        violations.push({
          rule: "a-compiled-span-is-its-bloks-verbatim-text",
          detail: `span ${span.blokId}: ${JSON.stringify(emitted)} is not the blok's ${JSON.stringify(blok.text)}`
        });
      }
    }
  }

  for (const blok of bloks) {
    if (blok.kind !== "expected" && !spanIds.has(blok.id)) {
      violations.push({
        rule: "every-emitting-blok-owns-a-span",
        detail: `blok ${blok.id} (${blok.kind}): emits text but no span covers it`
      });
    }
  }

  return violations;
}
