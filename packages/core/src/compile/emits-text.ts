// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { BlokKind } from "../classify/types.js";

/**
 * Whether a blok contributes text to the compiled prompt.
 *
 * **EPIC-020 decision 6, extracted so there is one copy of it.** `expected` is the only kind that
 * emits no text: it compiles to a check instead, and a prompt whose bloks are all `expected`
 * compiles to `""` plus a list of checks.
 *
 * It lives in its own module because EPIC-022 needs the same rule for a different question. "Is a
 * variable in this blok a use?" has exactly one honest answer — *yes if the text reaches the model* —
 * and that is this predicate. Written twice, the two copies would agree until the day a new kind
 * stopped emitting text, and then `{{customer}}` inside it would be reported as shipping to a
 * customer when it does not, or worse, not reported when it does.
 */
export function emitsText(blok: { readonly kind: BlokKind }): boolean {
  return blok.kind !== "expected";
}
