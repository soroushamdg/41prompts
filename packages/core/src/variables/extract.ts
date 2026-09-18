// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { emitsText } from "../compile/emits-text.js";
import type { PromptBlok } from "../compile/types.js";
import type { VariableOccurrence } from "./types.js";

/**
 * `{{` · optional whitespace · name · optional whitespace · `}}`.
 *
 * The name is `[A-Za-z_][A-Za-z0-9_]*`: it may not start with a digit, and it holds no spaces, dots
 * or dashes. Anything else between braces is not a variable — see `fixtures/prompts.ts`'s
 * `NOT_VARIABLES`, which is the specification for that sentence.
 *
 * **Whitespace inside the braces is tolerated** because the product already writes it that way:
 * `segment/fixtures/multimodal.ts` has carried `{{ invoice_image }}` since EPIC-010. That is
 * evidence about the intended syntax rather than a guess, and a syntax that rejected it would have
 * made an existing fixture wrong.
 *
 * Recreated per call rather than held at module scope: a global regex carries `lastIndex` between
 * uses, and a shared one would make `extractVariables` return different answers on the second call
 * with the same input. That is the kind of bug a deterministic module must not be able to have.
 */
function variablePattern(): RegExp {
  return /\{\{(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
}

/**
 * Hand edits, keyed by blok id — the same shape `compile()` takes, so a caller that has one has the
 * other. Only `text` is read here; the hash a `KeptSpan` also carries answers a different question.
 */
export interface VariableScanOptions {
  readonly keep?: ReadonlyMap<string, { readonly text: string }>;
}

/**
 * Every `{{name}}` in the text a model will actually see, in document order.
 *
 * ## What counts as a use, and why it is not a list of kinds
 *
 * A use is an occurrence **in text that reaches the compiled prompt**. `expected` bloks compile to
 * checks and emit no text, so a name written only there is not used — asked through `emitsText` so
 * that the compiler and this module cannot disagree about it.
 *
 * An `example` blok **is** a use. An example is text the model sees: if it contains `{{customer}}`
 * and nothing declares `customer`, the prompt ships a literal `"{{customer}}"` to somebody's
 * customer, which is the exact defect this module exists to catch (EPIC-022 ruling Q2).
 *
 * ## Hand edits win, because they are what ships
 *
 * Where a span has been edited by hand, that text replaces the blok's own in the compiled prompt.
 * So a variable typed into a hand edit is a use, and one edited *out* of a span is not — whatever
 * the blok's stored text still says. Reading `blok.text` in both cases would report the prompt that
 * would have shipped rather than the one that will.
 */
/**
 * Every brace form in one string, with no rule about whether it counts as a use.
 *
 * `extractVariables` is the question "what does this prompt send a model", and it filters
 * accordingly. This is the question "what does this text say", which is what a rename needs: a
 * rename is about the author's own vocabulary across their whole prompt, so it reaches text that
 * never ships — an `expected` blok that mentions `{{tone}}` should not be left pointing at a name
 * nobody kept.
 */
export function occurrencesInText(text: string, blokId: string, source: VariableOccurrence["source"] = "blok"): readonly VariableOccurrence[] {
  const pattern = variablePattern();
  const found: VariableOccurrence[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const leading = (match[1] as string).length;
    const name = match[2] as string;
    found.push({
      blokId,
      name,
      start: match.index,
      end: match.index + match[0].length,
      nameStart: match.index + 2 + leading,
      nameEnd: match.index + 2 + leading + name.length,
      source
    });
  }
  return found;
}

/** A name this module will accept: the same shape it extracts. */
export function isVariableName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function extractVariables(
  bloks: readonly PromptBlok[],
  options: VariableScanOptions = {}
): readonly VariableOccurrence[] {
  const found: VariableOccurrence[] = [];

  for (const blok of [...bloks].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (!emitsText(blok)) continue;

    const kept = options.keep?.get(blok.id);
    const text = kept?.text ?? blok.text;
    const source: VariableOccurrence["source"] = kept === undefined ? "blok" : "edited by hand";

    found.push(...occurrencesInText(text, blok.id, source));
  }

  return found;
}

/** The distinct names used, in first-appearance order. The order is the reading order of the prompt. */
export function usedVariableNames(occurrences: readonly VariableOccurrence[]): readonly string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const occurrence of occurrences) {
    if (seen.has(occurrence.name)) continue;
    seen.add(occurrence.name);
    names.push(occurrence.name);
  }
  return names;
}
