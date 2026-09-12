// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { PromptBlok } from "./types.js";

/**
 * The compiler's version identifier, in the hash of every span it produces.
 *
 * Bumping it invalidates every cached span everywhere, in one move and with no invalidation logic
 * for anyone to remember — the same job `HEURISTIC_SUMMARISER_VERSION` does for summaries.
 *
 * **Bump it whenever the compiled output for an unchanged blok would change**: the separator, the
 * ordering rule, anything `renderBlok` starts doing. That is not a convention anybody has to
 * remember either, it is the only way a content-addressed cache can be correct across a change to
 * the thing doing the addressing.
 */
export const COMPILER_VERSION = "compile@2";

/**
 * What goes between two bloks in the compiled prompt. **A constant, not an option.**
 *
 * It is deliberately not in `CompileOptions`. The separator is not part of `blokHash`, so an option
 * that changed it would change every span's output while leaving every cache key untouched — a
 * stale-cache generator with a nice name. A constant covered by `COMPILER_VERSION` cannot do that.
 *
 * **A single newline, matching `docs/design/41prompts-full-mockup.html`**, which joins spans with
 * `'\n'` — `CLAUDE.md` says the mockups are the spec, and this one had a compiled pane drawn in it.
 * It shipped as a blank line in `compile@1` and was ruled to the mockup on 2026-09-12; that ruling is
 * the reason `COMPILER_VERSION` is at 2, which is the whole point of having it. The cost, measured
 * rather than assumed and written up in EPIC-020's report: two adjacent prose bloks now read as one
 * paragraph in the compiled prompt, where a blank line kept them apart.
 */
export const BLOK_SEPARATOR = "\n";

/**
 * A blok's content hash: **its verbatim text, its kind, and the compiler version** (decision 4).
 *
 * ## What is in it
 *
 * The kind is in it because the kind decides whether the blok emits text at all — `expected` emits a
 * check and nothing else — so two bloks with the same text and different kinds compile to different
 * things and must not share a cache entry. The text is length-prefixed for the same reason
 * `summaryInputHash` length-prefixes its ranges: so that no two different inputs can be joined into
 * the same string.
 *
 * ## What is deliberately not in it
 *
 * **`order`, and the blok's position.** Moving a rule up the canvas does not change what the rule
 * says, so it must not throw away its compiled output or its cached span. This is what makes the
 * reorder criterion true rather than nearly true: after a reorder every span keeps its hash and its
 * width, and only the offsets move. It is also what makes `drift()`'s second fact mean something —
 * "the blok changed since" has to mean the blok, not where it sits.
 */
export function blokHash(blok: PromptBlok): string {
  return hash(`${COMPILER_VERSION} ${blok.kind} ${blok.text.length}:${blok.text}`);
}

/**
 * Sixteen hex digits of FNV-1a, run twice from different bases and concatenated.
 *
 * The same construction `cluster.ts` uses for blok ids and `summaryInputHash` uses for its cache
 * key, and for the same reason: thirty-two bits is a birthday collision waiting to happen once
 * there are thousands of keys, and a colliding key here hands back **another blok's text** as this
 * blok's compiled span. Not a cryptographic hash and not used as one — it addresses content, it
 * does not authenticate it.
 */
export function hash(input: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    low ^= code;
    low = Math.imul(low, 0x01000193) >>> 0;
    high ^= code + i;
    high = Math.imul(high, 0x85ebca6b) >>> 0;
  }
  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}
