// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { checkFor } from "./checks.js";
import { BLOK_SEPARATOR, blokHash } from "./hash.js";
import type { Check, Compiled, CompiledSpan, CompileOptions, PromptBlok, SpanCache } from "./types.js";

/**
 * Compile a blok set into one prompt: per blok, deterministically, cached by content hash.
 *
 * ## The two representations
 *
 * The blok set is the **source of truth** (decision 2). This is what it compiles to — derived, and
 * never merged back. A span edited by hand is an exception the model *records*; `compile()` itself
 * always produces a fresh, fully `compiled` result.
 *
 * **That is worth saying out loud, because it has a consequence this epic does not close:** calling
 * `compile()` again discards hand edits. Within this package that is correct and deliberate — there
 * is no merge anywhere here, by decision 8 — but it means whoever builds the compiled pane
 * (EPIC-021b) has to decide what happens when a blok is *added* to a prompt that has hand-edited
 * spans, since `updateFromBlok` only ever touches a span that already exists. Named in the report
 * rather than pre-empted with an API nobody has asked for yet.
 *
 * ## What the compiler decides, and what it never touches
 *
 * Ordering and separators. **Never wording** (`CLAUDE.md` rule 3): a blok's text is emitted byte for
 * byte, and a summary never reaches the output — `checkCompiledInvariants` re-derives that from the
 * result alone, so it holds for every input rather than for the inputs somebody tested.
 */
export function compile(bloks: readonly PromptBlok[], options: CompileOptions = {}): Compiled {
  assertUniqueIds(bloks);

  const pieces: string[] = [];
  const spans: CompiledSpan[] = [];
  const checks: Check[] = [];
  let at = 0;

  for (const blok of ordered(bloks)) {
    // Decision 6. The only kind that emits no text, and an all-`expected` prompt therefore compiles
    // to `""` plus a list of checks — correct, not an error, and not a case to guard against.
    if (blok.kind === "expected") {
      checks.push(checkFor(blok));
      continue;
    }

    const hash = blokHash(blok);
    const text = render(blok, hash, options.cache);

    pieces.push(text, BLOK_SEPARATOR);
    spans.push({
      blokId: blok.id,
      start: at,
      textEnd: at + text.length,
      end: at + text.length + BLOK_SEPARATOR.length,
      hash,
      state: "compiled"
    });
    at += text.length + BLOK_SEPARATOR.length;
  }

  return { text: pieces.join(""), spans, checks };
}

/**
 * Sort by `order`, then by `id`.
 *
 * Sorting at all is decision 10: the caller's array order is incidental — a row order, whatever a
 * query returned — and compiling by it would make the output depend on something nobody chose.
 *
 * The tie-break on `id` is not decoration. Two bloks sharing an `order` is a state EPIC-021a can
 * reach the moment someone drags a card, and without a tie-break `Array.prototype.sort`'s stability
 * would hand the decision back to the array order this sort exists to ignore — so the same blok set
 * could compile two ways. Comparing by code unit rather than by locale for the same reason: a
 * locale-aware comparison depends on the machine's environment, and determinism is rule 2.
 */
function ordered(bloks: readonly PromptBlok[]): PromptBlok[] {
  return [...bloks].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * One blok's text, from the cache when it is there.
 *
 * `render` is the **seam for structure**, and today it is the identity function. The epic gives the
 * compiler "ordering, separators, and the rendering of structure"; the first two are here, and the
 * third is deliberately nothing yet. A heading per kind or a list marker adds text nobody wrote,
 * cannot be judged without a pane to see it in (EPIC-021b), and would turn "the compiler emits blok
 * text verbatim" from something provable into something to argue about. The seam exists so that
 * adding it later is one function and one `COMPILER_VERSION` bump.
 */
function render(blok: PromptBlok, hash: string, cache: SpanCache | undefined): string {
  const cached = cache?.get(hash);
  if (cached !== undefined) return cached;

  const text = blok.text;
  cache?.set(hash, text);
  return text;
}

/**
 * Two bloks with one id is rejected rather than tolerated.
 *
 * Every span names its blok by id, so a duplicate makes `editSpan`, `updateFromBlok` and `drift`
 * ambiguous about which blok they are talking about — and the ambiguity would surface later, in a
 * pane showing the wrong text, rather than here where the caller can still see what it passed in.
 */
function assertUniqueIds(bloks: readonly PromptBlok[]): void {
  const seen = new Set<string>();
  for (const blok of bloks) {
    if (seen.has(blok.id)) {
      throw new Error(`compile: two bloks share the id ${JSON.stringify(blok.id)}; ids must be unique in a blok set`);
    }
    seen.add(blok.id);
  }
}
