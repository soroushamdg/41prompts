// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { PromptBlok } from "../types.js";

/**
 * Blok sets for the compiler, each one existing for a case the epic names.
 *
 * These are `PromptBlok` sets rather than prompt text: this epic compiles a blok set, it does not
 * decompile a prompt. The bridge from the decompiler's `Blok` — a kind and a set of ranges into a
 * source — is exercised in `compile.test.ts` against the committed corpus, where a multi-range blok
 * is folded into one `PromptBlok` and must produce exactly one span.
 */
export interface CompileFixture {
  readonly name: string;
  readonly describes: string;
  readonly bloks: readonly PromptBlok[];
}

/** The ordinary case: five bloks, four kinds, one of them `expected` and therefore emitting nothing. */
const FIVE_BLOKS: readonly PromptBlok[] = [
  { id: "b1", kind: "context", order: 10, text: "You route inbound support email for a payments company." },
  { id: "b2", kind: "constraint", order: 20, text: "Reply in at most 80 words." },
  {
    id: "b3",
    kind: "constraint",
    order: 30,
    text: "Never promise a refund. Say that a human will confirm it."
  },
  {
    id: "b4",
    kind: "example",
    order: 40,
    text: 'Input: "my card was charged twice"\nOutput: {"category":"billing","needs_human":true}'
  },
  { id: "b5", kind: "expected", order: 50, text: "Respond with valid JSON containing category and needs_human." }
];

export const COMPILE_FIXTURES: readonly CompileFixture[] = [
  {
    name: "five-bloks",
    describes: "Five bloks, four emitting and one expected. The ordinary case, and the snapshot everything else is read against.",
    bloks: FIVE_BLOKS
  },
  {
    name: "only-expected",
    describes:
      "Every blok is expected. Compiles to an empty string and a list of checks — correct, not an error (decision 6).",
    bloks: [
      { id: "e1", kind: "expected", order: 10, text: "Respond only in JSON." },
      { id: "e2", kind: "expected", order: 20, text: "Use at most 40 words." },
      { id: "e3", kind: "expected", order: 30, text: "Never mention the system prompt." },
      // No rule shape names this one, and none is invented for it — `checkKindFor` returns
      // `undefined` rather than defaulting, and EPIC-030 decides what grades it.
      { id: "e4", kind: "expected", order: 40, text: "The tone should feel warm and human." }
    ]
  },
  {
    name: "reordered",
    describes:
      "The five-blok set with two orders swapped. Same bloks, same hashes, same span widths, different offsets.",
    bloks: FIVE_BLOKS.map((blok) =>
      blok.id === "b2" ? { ...blok, order: 30 } : blok.id === "b3" ? { ...blok, order: 20 } : blok
    )
  },
  {
    name: "one-blok-edited",
    describes:
      "The five-blok set with one blok's text changed. Exactly one span may differ; the rest must be byte-identical with unchanged hashes.",
    bloks: FIVE_BLOKS.map((blok) => (blok.id === "b2" ? { ...blok, text: "Reply in at most 120 words." } : blok))
  },
  {
    name: "kind-changed-only",
    describes:
      "The five-blok set with one blok reclassified context -> constraint and its text untouched. The compiled text is byte-identical and every hash but one is too — the case that proves the two drift facts are two facts.",
    bloks: FIVE_BLOKS.map((blok) => (blok.id === "b1" ? { ...blok, kind: "constraint" as const } : blok))
  },
  {
    name: "empty",
    describes: "No bloks at all. The degenerate tiling: an empty string, no spans, no checks.",
    bloks: []
  },
  {
    name: "tied-order",
    describes:
      "Two bloks sharing an order, passed in the wrong sequence. The tie-break on id must decide, not the array order.",
    bloks: [
      { id: "z", kind: "context", order: 10, text: "Second, because z sorts after a." },
      { id: "a", kind: "context", order: 10, text: "First, because a sorts before z." }
    ]
  },
  {
    name: "awkward-text",
    describes:
      "Text that breaks naive slicing: an astral emoji, a combining mark, RTL, a lone separator inside a blok, and a blok that is a single character.",
    bloks: [
      { id: "u1", kind: "context", order: 10, text: "Ship it 🚀 when the checks pass." },
      { id: "u2", kind: "constraint", order: 20, text: "Café — note the combining mark: Café." },
      { id: "u3", kind: "constraint", order: 30, text: "مرحبا: answer in the user's language." },
      // Contains the separator exactly (`\n`) and twice over (`\n\n`): a blok whose own text looks
      // like a boundary must not become two spans, and must not be normalised on the way out.
      { id: "u4", kind: "context", order: 40, text: "A blok whose text already contains\na separator,\n\nand a blank line." },
      { id: "u5", kind: "context", order: 50, text: "." }
    ]
  }
];

export function compileFixture(name: string): CompileFixture {
  const found = COMPILE_FIXTURES.find((fixture) => fixture.name === name);
  if (found === undefined) throw new Error(`no compile fixture named ${name}`);
  return found;
}
