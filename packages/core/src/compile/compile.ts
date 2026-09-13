// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { checkFor } from "./checks.js";
import { emitsText } from "./emits-text.js";
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
 * **`options.keep` is the exception, and it exists for one failure.** Without it, calling `compile()`
 * again discards every hand edit — so adding one blok to a prompt somebody has edited by hand loses
 * their typing, silently, with the recompiled text looking entirely plausible. EPIC-021a decision 5
 * calls that the only failure in that epic that loses work rather than inconveniencing someone.
 * `keep` carries those spans forward by blok id, with the hash each was taken at.
 *
 * `compile(bloks)` with no `keep` is unchanged: a fresh compile, a pure function of the blok set
 * alone, every span `compiled`. That is what EPIC-050's artifact builder wants — it publishes what
 * the bloks say, not an exception somebody made in an editor.
 *
 * This is still not a merge (decision 8). A kept span is placed, not reconciled; nothing is compared
 * and nothing is combined.
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
    // The predicate is `emitsText` rather than a comparison here because EPIC-022 asks the same
    // question of the same bloks and must get the same answer; see `emits-text.ts`.
    if (!emitsText(blok)) {
      checks.push(checkFor(blok));
      continue;
    }

    // A hand edit is an exception to this blok's compiled output, so it is applied *instead of*
    // rendering — and it keeps the hash it was taken at, never this compile's. Recomputing the hash
    // here would quietly answer "no" to "has the blok changed since you edited this" for ever.
    const ownHash = blokHash(blok);
    const kept = options.keep?.get(blok.id);
    const text = kept?.text ?? render(blok, ownHash, options.cache);
    const hash = kept?.hash ?? ownHash;

    pieces.push(text, BLOK_SEPARATOR);
    spans.push({
      blokId: blok.id,
      start: at,
      textEnd: at + text.length,
      end: at + text.length + BLOK_SEPARATOR.length,
      hash,
      state: kept === undefined ? "compiled" : "edited by hand"
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
