// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The prompts the golden files are generated from (EPIC-053, C2 and C3).
 *
 * One set, both languages, so a reader can open `__goldens__/prompts.ts.txt` and
 * `__goldens__/prompts.py.txt` side by side and see exactly where the two diverge.
 *
 * **Every row is here because it broke something**, or would:
 *
 * - `Refund classifier` — the ordinary case: a required variable, an optional one with a default,
 *   and an **undeclared** one, which is EPIC-055's drive finding.
 * - `Daily summary` — no variables, so it takes no argument in either language.
 * - `2024 refunds` — a leading digit, which is not a legal identifier in either language.
 * - `Résumé parser` — non-ASCII, legal in both, and a reminder that the file is UTF-8.
 * - `Odd names` — a space, a hyphen and a Python keyword. TypeScript quotes them; Python cannot,
 *   which is the one place the two files are not transliterations of each other.
 * - `refund-classifier` — collides with the first row after normalisation.
 */

import type { CodegenPrompt } from "@41prompts/core";

export const GOLDEN_PROMPTS: readonly CodegenPrompt[] = [
  {
    id: "pr_1a2b3c4d",
    name: "Refund classifier",
    variables: [
      { name: "customer_name", optional: false, declared: false },
      { name: "email", optional: false, declared: true },
      { name: "locale", optional: true, declared: true },
    ],
  },
  { id: "pr_2b3c4d5e", name: "Daily summary", variables: [] },
  {
    id: "pr_3c4d5e6f",
    name: "2024 refunds",
    variables: [{ name: "month", optional: false, declared: true }],
  },
  {
    id: "pr_4d5e6f70",
    name: "Résumé parser",
    variables: [{ name: "résumé", optional: false, declared: true }],
  },
  {
    id: "pr_5e6f7081",
    name: "Odd names",
    variables: [
      { name: "customer name", optional: false, declared: true },
      { name: "x-locale", optional: true, declared: true },
      { name: "class", optional: false, declared: true },
    ],
  },
  { id: "pr_6f708192", name: "refund-classifier", variables: [] },
];
