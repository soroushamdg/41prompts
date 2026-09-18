// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * What a blok is. Exactly the six kinds in `CLAUDE.md`, and this union is the only place they are
 * written down — the standing research note says EPIC-080's findings can change how kinds are
 * *presented*, so presentation must never re-spell them.
 *
 * `context` is the safe default. It is what a segment gets when nothing more specific fires, and it
 * is safe because context compiles to text unchanged: guessing `context` wrongly costs a label,
 * where guessing `expected` wrongly invents a check that can fail a publish.
 */
export type BlokKind = "context" | "constraint" | "example" | "expected" | "image_ref" | "image_input";

/** Every kind, in the order `CLAUDE.md` lists them. Useful for exhaustiveness tests. */
export const BLOK_KINDS: readonly BlokKind[] = [
  "context",
  "constraint",
  "example",
  "expected",
  "image_ref",
  "image_input"
];

/** What `classify()` decided, and enough to argue with it. */
export interface Classification {
  readonly kind: BlokKind;
  /**
   * A number in `[0, 1]`.
   *
   * **Not a probability.** It is an ordering device: it says which of two classifications rests on
   * more specific evidence, so a UI can sort or hedge and a later epic can prefer one signal over
   * another. It is not calibrated, nothing divides by it, and no threshold in this package treats
   * it as a frequency.
   */
  readonly confidence: number;
  /**
   * The stable id of the heuristic that fired, from `heuristics.json`. This is the field that makes
   * a wrong classification debuggable without a debugger: it names the rule to go and look at.
   */
  readonly matched: string;
}
