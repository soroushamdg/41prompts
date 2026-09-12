// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import ruleShapesData from "../detect/rule-shapes.json" with { type: "json" };
import { hash } from "./hash.js";
import type { Check, CheckKind, PromptBlok } from "./types.js";

/**
 * What an `expected` blok becomes instead of text.
 *
 * **Modelled here, executed in EPIC-030.** Decision 6: an expected blok emits no text and compiles
 * to a check, and a prompt whose bloks are all `expected` compiles to an empty string plus a list of
 * checks — which is correct, not an error.
 */

/**
 * ADR-003's phrase → the internal identifier for it.
 *
 * `rule-shapes.json` already carries the phrase, because EPIC-012b's detector has to *say* which
 * check would cover a rule. Reading it back through this table rather than adding a second column to
 * that file keeps one source for the mapping: if a shape ever names a phrase that is not ADR-003's,
 * the lookup misses and `checks.test.ts` fails, instead of a typo silently becoming a ninth kind.
 */
const KIND_BY_PHRASE: Readonly<Record<string, CheckKind>> = {
  "valid JSON shape": "json_shape",
  "one of the allowed values": "allowed_values",
  "word limit": "word_limit",
  "character limit": "character_limit",
  "must contain": "must_contain",
  "must not contain": "must_not_contain",
  "matches a pattern": "matches_pattern",
  "refuses to answer": "refuses_to_answer"
};

interface Shape {
  readonly kind: CheckKind | undefined;
  readonly test: RegExp;
}

/** File order is precedence, the same as in `rule-without-check.ts`: the most specific shape wins. */
const SHAPES: readonly Shape[] = ruleShapesData.map((row) => ({
  kind: KIND_BY_PHRASE[row.check],
  test: new RegExp(row.pattern, row.flags)
}));

/**
 * Which of the eight this expected blok describes, **when one of them can honestly be named**.
 *
 * Returns `undefined` rather than guessing. `rule-shapes.json` is the committed, tested map from
 * rule text to the check that would cover it — reusing it here is the same question asked from the
 * other side, and it means the decompiler and the compiler cannot disagree about what a rule needs.
 *
 * When no shape matches there is no honest answer, and the two ways of manufacturing one are both
 * worse than `undefined`:
 *
 * - **A ninth kind** ("a judge decides") would contradict ADR-003 and `CLAUDE.md`, which fix the set
 *   at eight. `CLAUDE.md` records what happened the last time that list was treated casually.
 * - **A default of `must_contain`** would assert a substring nobody wrote, and a check that asserts
 *   something the author did not say is worse than no check: it fails a publish for the wrong reason.
 *
 * **Provisional.** EPIC-030 owns the real check model and may narrow or replace this entirely; the
 * kindless ones are the obvious work for EPIC-033's pinned judge.
 */
export function checkKindFor(text: string): CheckKind | undefined {
  for (const shape of SHAPES) {
    if (shape.test.test(text)) return shape.kind;
  }
  return undefined;
}

/**
 * The check one `expected` blok compiles to.
 *
 * The id is derived from the blok's id and its text, so it is stable across a recompile and changes
 * when the text does — a check can be linked to, and a link does not silently start pointing at a
 * different assertion after an edit.
 */
export function checkFor(blok: PromptBlok): Check {
  const kind = checkKindFor(blok.text);
  return {
    id: `chk_${hash(`${blok.id} ${blok.text.length}:${blok.text}`)}`,
    blokId: blok.id,
    // Verbatim, like everything else the compiler touches. The check is *about* this text; it is
    // never a paraphrase of it (`CLAUDE.md` rule 3 applies here too).
    text: blok.text,
    ...(kind === undefined ? {} : { kind })
  };
}
