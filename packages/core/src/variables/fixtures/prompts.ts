// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { PromptBlok } from "../../compile/types.js";

/**
 * The extraction corpus. Real prompt shapes, not minimal strings, because the cases that matter are
 * the ones a person actually writes: a variable used in three places, one written with inner spaces,
 * one inside an example, one inside an expectation, and four brace forms that look like variables
 * and are not.
 */
function blok(id: string, kind: PromptBlok["kind"], text: string, order: number): PromptBlok {
  return { id, kind, text, order };
}

/** A support prompt that uses three variables, one of them three times. */
export const SUPPORT_PROMPT: readonly PromptBlok[] = [
  blok(
    "b1",
    "context",
    "You are the support assistant for {{company}}. The customer you are helping is {{ customer_name }}.",
    0
  ),
  blok("b2", "constraint", "Never promise a refund on behalf of {{company}} without a case id.", 1),
  blok(
    "b3",
    "example",
    'Customer: "where is my order"\nYou: "Let me check that for you, {{ customer_name }}. Do you have the order number?"',
    2
  ),
  blok("b4", "constraint", "Sign off as {{agent_handle}}.", 3)
];

/**
 * The same name written in an `expected` blok and nowhere else.
 *
 * An expected blok compiles to a check, not to text (EPIC-020 decision 6), so nothing here reaches a
 * model and `{{tone}}` is not a use. This fixture is the one that would silently pass if the rule
 * were re-implemented as a hand-written list of kinds instead of the compiler's own predicate.
 */
export const EXPECTATION_ONLY: readonly PromptBlok[] = [
  blok("e1", "context", "Answer the question.", 0),
  blok("e2", "expected", "The reply matches the tone described in {{tone}}.", 1)
];

/**
 * Brace forms that are **not** variables and must stay literal.
 *
 * Nothing here is an error and nothing here is reported. A blok holds someone's writing verbatim
 * (`CLAUDE.md` rule 3), a stray brace is not necessarily a mistake, and the product does not scold.
 */
export const NOT_VARIABLES: readonly PromptBlok[] = [
  blok("n1", "context", "Return JSON shaped like {{}} when you have nothing to say.", 0),
  blok("n2", "context", "The placeholder syntax is {{ 9lives }} — invalid, names cannot start with a digit.", 1),
  blok("n3", "context", "Two words in braces {{ first second }} is not one name.", 2),
  blok("n4", "context", "An unclosed {{brace and the rest of the sentence.", 3),
  blok("n5", "context", "A single {brace} is ordinary punctuation.", 4)
];

/** A prompt with no braces at all, to prove the empty answer is an empty array and not a throw. */
export const NO_VARIABLES: readonly PromptBlok[] = [
  blok("p1", "context", "Summarise the email in one sentence.", 0)
];
