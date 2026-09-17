// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * A prompt name turned into something a program can call (EPIC-055, moved here by EPIC-053).
 *
 * Moved verbatim from `apps/web/lib/connect/generate.ts` so the Connect page and `41p pull` produce
 * the same file — see `types.ts` for why that has to be one implementation rather than two.
 */

import type { CodegenPrompt } from "./types.js";

/**
 * A TypeScript identifier for a prompt name, or a fallback derived from its id.
 *
 * The rules, in order, and each one exists because a real prompt name breaks without it:
 *
 * - Split on anything that is not a letter or a digit, so `refund-classifier` and `Refund Classifier`
 *   both arrive at `refundClassifier`.
 * - Lower-case the first word and capitalise the rest. A name that is already camelCase survives.
 * - **A leading digit is not a legal identifier**, so `2024 refunds` would produce `2024Refunds`,
 *   which does not parse. It gets a `p` in front.
 * - A name with no letters or digits at all — `***` — yields nothing to work with, so the id is the
 *   name: `prompt_1a2b3c4d`. Losing the readable name is better than emitting a file that does not
 *   compile, and the id is beside it in the table anyway.
 *
 * Python's rules are a superset of these for every name this can produce — see `python.ts`, which
 * converts the result to `snake_case` rather than deriving its own.
 */
export function identifierFor(prompt: Pick<CodegenPrompt, "id" | "name">): string {
  const words = prompt.name.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  if (words.length === 0) return `prompt_${prompt.id.replace(/[^\p{L}\p{N}]/gu, "")}`;

  const camel = words
    .map((word, index) => (index === 0 ? lowerFirst(word) : upperFirst(word)))
    .join("");
  return /^\p{N}/u.test(camel) ? `p${upperFirst(camel)}` : camel;
}

const lowerFirst = (word: string): string => word.charAt(0).toLowerCase() + word.slice(1);
const upperFirst = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The identifiers for a whole project, with collisions resolved.
 *
 * Two prompts called "Refund classifier" and "refund-classifier" normalise to the same name, and a
 * file with two `export function refundClassifier` does not compile. The second and subsequent ones
 * get a numeric suffix, in the order they are listed, so the file is stable across reloads and
 * across a `41p pull` that follows one.
 */
export function identifiersFor(prompts: readonly CodegenPrompt[]): Map<string, string> {
  const taken = new Set<string>();
  const byPromptId = new Map<string, string>();

  for (const prompt of prompts) {
    const base = identifierFor(prompt);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) {
      candidate = `${base}${n}`;
      n += 1;
    }
    taken.add(candidate);
    byPromptId.set(prompt.id, candidate);
  }
  return byPromptId;
}
