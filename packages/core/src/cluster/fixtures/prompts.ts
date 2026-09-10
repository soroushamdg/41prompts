// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Whole-prompt clustering fixtures. Written before the merge rule, on purpose: `false-merge` is
// the test that stops this epic shipping something that feels clever and is wrong, and a fixture
// written after the rule it is meant to constrain only ever confirms the rule.

import { lf } from "../../segment/fixtures/text.js";
import type { SegmentFixture } from "../../segment/types.js";

export const CLUSTER_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "false-merge",
    describes:
      "Three temptations to merge, none of which may be taken: unrelated rules that all mention a field, a contradiction with high token overlap, and a one-token overlap at 1.0.",
    text: lf(
      "You are a support triage assistant for Northwind.",
      "",
      "Rules:",
      // The prototype's own blok 6, in spirit. Three unrelated rules, merged by the prototype
      // purely because each contains the word "field" — one alternative of its `json-shape` topic
      // key. Nothing here may join anything else here.
      "1. Keep the summary field reasonably short.",
      "2. If the customer sounds angry, set the priority field to high.",
      "3. Always be professional and friendly in the summary field.",
      "",
      // Normalised tokens overlap 2/3 = 0.667, over the 0.6 threshold, and both classify as
      // `constraint` — so the naive rule merges two rules that contradict each other. Merging
      // them would both hide the contradiction from EPIC-012a, which compares bloks, and put text
      // in a blok the reader would never expect to own it.
      "Always respond in JSON only.",
      "",
      "Never respond in JSON when the caller asked for plain text.",
      "",
      // Normalisation drops words of three characters or fewer, so the first of these is a single
      // token. One shared token out of one is an overlap of 1.0 — the highest score the measure
      // can produce, on the least evidence it can have.
      "Use markdown.",
      "",
      "Markdown headings must be sentence case.",
      "",
      // Found in self-review. `overlap()` divides by the smaller vocabulary, so a short rule whose
      // every word appears somewhere in a long paragraph scores a perfect 1.0 and swallows it.
      "Always use YAML format.",
      "",
      "The audit trail must use YAML format for every entry so downstream consumers can parse it without guessing, and each record has to carry a timestamp, an actor, a resource identifier and the outcome of the attempted operation.",
      ""
    )
  },
  {
    name: "polarity-order",
    describes:
      "A neutral rule, then the same rule asserted, then the same rule forbidden — in that order. The first two are one blok; the third may never join them however the blok was opened.",
    text: lf(
      // Found in self-review, and the order is the whole fixture. The polarity guard used to consult
      // only a group's *first* fragment, so a neutral opener let a positive and a negative rule both
      // join it and all three became one blok — the merge the guard exists to prevent, reachable by
      // arranging the fragments so the guard never saw a polarity to disagree with.
      //
      // This one does not belong in `false-merge`: the neutral and the positive are genuine
      // restatements and *should* merge. Keeping it separate lets `false-merge` keep its blunt
      // "nothing here merges at all" assertion, which is what makes an unexpected merge there fail
      // loudly rather than only in the case somebody thought of.
      "Reply in French.",
      "",
      "Always reply in French, every time.",
      "",
      "Never reply in French on the audit channel.",
      ""
    )
  },
  {
    name: "multi-range",
    describes:
      "The shape the product is named for: one rule stated in the opening line and restated verbatim as the last numbered rule, which must become one blok with two non-adjacent ranges.",
    text: lf(
      "Always respond in JSON only, with no extra text before or after.",
      "",
      "You are an email router for a support desk. Read the incoming message and pick a category.",
      "",
      "Rules:",
      "1. Classify the email as billing, technical or other.",
      "2. Set a priority from low, medium or high.",
      "3. Always respond in JSON only, with no extra text before or after.",
      ""
    )
  },
  {
    name: "single-range-only",
    describes: "Every rule said once. Every blok must carry exactly one range, and still carry it as an array.",
    text: lf(
      "You are a changelog editor.",
      "",
      "Write every entry in the past tense.",
      "",
      "Never exceed twenty words per entry.",
      "",
      "Group entries under Added, Changed and Fixed.",
      ""
    )
  },
  {
    name: "all-context",
    describes: "A prompt with no rules at all — nothing but role and background. Every blok is context, and nothing merges.",
    text: lf(
      "You are an assistant that helps a small team read its own support inbox.",
      "",
      "The team sells inventory software to mid-sized distributors.",
      "",
      "Most messages arrive in English, some in French.",
      ""
    )
  },
  {
    name: "prototype-sample",
    describes:
      "The decompiler prototype's sample prompt, the parity case for criterion 8. The prototype clusters it into 10 bloks, three of them multi-range and all three false merges.",
    text: lf(
      "You are a helpful customer support assistant for Northwind, a B2B SaaS company that sells inventory software. You should always be professional and friendly.",
      "",
      "Your job is to read an incoming support email and decide how to route it.",
      "",
      "Rules:",
      "1. Always classify the email into one of these categories: billing, technical, onboarding, cancellation, other.",
      "2. You must respond in JSON only. Do not include any explanation outside the JSON.",
      "3. Never mention that you are an AI model.",
      "4. Keep the summary field reasonably short and use appropriate language.",
      "5. If the customer sounds angry, set the priority field to high.",
      "6. Always be professional and friendly in the summary field.",
      "",
      "The JSON should have these fields: category, priority, summary, needs_human.",
      "Please make sure the output is valid JSON. Thank you!",
      "",
      "For example, if the email says 'I was charged twice this month', you would return {\"category\":\"billing\",\"priority\":\"medium\"}.",
      "",
      "When the email mentions a chargeback, always set needs_human to true.",
      "",
      "Do not use markdown formatting in your response. Format the summary as a markdown bullet list if there are multiple issues.",
      "",
      "If you are unsure about the category, use your best judgement and pick the most likely one.",
      "",
      "Remember: respond in JSON only, with no extra text before or after."
    )
  }
];
