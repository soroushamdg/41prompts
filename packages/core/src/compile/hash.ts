// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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
export const COMPILER_VERSION = "compile@3";

/**
 * What goes between two bloks in the compiled prompt. **A blank line, and a constant, not an option.**
 *
 * It is deliberately not in `CompileOptions`. The separator is not part of `blokHash`, so an option
 * that changed it would change every span's output while leaving every cache key untouched — a
 * stale-cache generator with a nice name. A constant covered by `COMPILER_VERSION` cannot do that.
 *
 * ## Why a blank line and not a single newline — settled, with a measurement
 *
 * `compile@1` used a blank line. `compile@2` was a single newline, matching the mockup's compiled
 * pane (`join('\n')`), on the reading that `CLAUDE.md` makes the mockups the spec. **That was
 * reversed in `compile@3` on 2026-09-12**, and the reasoning is worth keeping because it is not
 * about this constant:
 *
 * **The mockup is the spec for what a pane looks like, not for what string a model receives.** With
 * a single newline a blok boundary is indistinguishable from a newline *inside* a blok's own text —
 * a list blok followed by an example blok runs together, with nothing marking where one stops. On
 * the committed corpus that is 25 of 160 bloks, reaching **14 of the 27 multi-blok prompts**. A
 * blank line keeps the boundary recoverable for every blok that does not itself contain one, which
 * is 155 of 160.
 *
 * Nothing in the product could see the difference — spans carry the offsets, so the pane,
 * attribution and drift were unaffected and every test passed either way. The loss was in the string
 * the model reads, which is exactly why it was worth being conservative about.
 *
 * **The middle option was rejected on a harder ground than taste.** "`\n` normally, `\n\n` where
 * either side contains a newline" makes a span's separator depend on its **neighbours**. Editing one
 * blok would then change the bytes of the span before it — breaking "changing one blok changes
 * exactly one span" (`CLAUDE.md` rule 4) — and, worse, that span's `hash` would not move with its
 * bytes, since `blokHash` covers only the blok's own text and kind. The cache would hand back output
 * that no longer matched. It is the same failure this comment's second paragraph rules out for
 * options, arriving by a different door.
 */
export const BLOK_SEPARATOR = "\n\n";

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
