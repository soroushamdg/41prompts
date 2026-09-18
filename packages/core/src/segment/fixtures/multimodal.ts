// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Corpus prompts for the three blok kinds the original 25 never contained.
//
// **This file is EPIC-011a's fixture debt, paid in EPIC-013.** That epic's classifier report says
// it plainly: "The EPIC-010 corpus contains no image segment and no expectation segment — 25 real
// prompts, and not one of them multimodal or written as a check. So three of the six kinds get no
// coverage from the accuracy table, and padding that table with text written to match my own
// patterns would only make the headline number dishonest." The three kinds are `image_ref`,
// `image_input` and `expected`.
//
// Two multimodal prompts and two written as expectations, per EPIC-013's Scope. They are written as
// prompts somebody would actually paste — a design-review assistant that is handed screenshots, an
// invoice reader that is handed a photo, a test-case sheet, an API-contract check — rather than as
// four collections of sentences that happen to match `heuristics.json`. The accuracy number is only
// worth reporting if the text was not written to produce it, so these were written before the
// labelled rows were extracted from them, and the misses are reported rather than tuned away.

import type { SegmentFixture } from "../types.js";
import { lf } from "./text.js";

export const MULTIMODAL_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "design-review-screenshots",
    describes:
      "A design-review prompt carrying markdown image references, an HTML <img>, and a bare file path. Covers `image_ref`, which no other corpus prompt does.",
    text: lf(
      "You are a design reviewer for a product team shipping a web app.",
      "",
      "You are given the current build and the approved design, and you report every difference.",
      "",
      "The approved design is here: ![approved checkout](./design/checkout-v4.png)",
      "",
      'The current build is <img src="https://shots.internal/build/checkout-latest.png" alt="current checkout">.',
      "",
      "The spacing scale we use is documented in design/tokens/spacing-scale.png and is the source of truth.",
      "",
      "Rules:",
      "1. Report differences in spacing, type scale, colour and copy, in that order.",
      "2. Quote the exact element you mean, using the text inside it.",
      "3. Never report a difference you cannot point at in both images.",
      "4. Always include the viewport width you assumed.",
      ""
    )
  },
  {
    name: "invoice-photo-reader",
    describes:
      "An extraction prompt whose input is an uploaded photo, referenced as a variable, as a tag, and in prose. Covers `image_input`.",
    text: lf(
      "You read photographs of paper invoices and return their contents as data.",
      "",
      "<image>",
      "",
      "Read the attached photo and transcribe every line item you can see.",
      "",
      "The scan to work from is {{ invoice_image }}.",
      "",
      "Rules:",
      "1. Respond in JSON only, with the fields supplier, date, currency, lines and total.",
      "2. Never guess a digit you cannot read; write null and say which field it was.",
      "3. Always include the currency beside every amount.",
      "4. Do not correct arithmetic that is wrong on the paper.",
      ""
    )
  },
  {
    name: "expected-output-sheet",
    describes:
      "A prompt written as a sheet of expectations — the shape somebody uses when they already think in checks. Covers `expected`, and is the corpus's only prompt where an expected blok actually covers a rule, so `rule_without_check`'s coverage path is exercised on real text rather than only on its own fixture.",
    text: lf(
      "You classify inbound sales email for a small B2B team.",
      "",
      "Always respond in JSON only.",
      "",
      "Expected output: JSON only, with no text around it.",
      "",
      "The expected result for a pricing question is the category pricing with confidence above 0.8.",
      "",
      "The reply must equal one of these values: pricing, demo, support, recruiting, other.",
      "",
      "Expected response for an email with no discernible intent: the category other, and a reason field saying why.",
      "",
      "Never invent a category that is not in that list.",
      ""
    )
  },
  {
    name: "api-contract-check",
    describes:
      "Expectations written as equalities about a response body, mixed with two ordinary rules. The second `expected` prompt, deliberately less uniform than the first.",
    text: lf(
      "You review a pull request that changes a public HTTP endpoint.",
      "",
      "For every changed endpoint, state whether the contract still holds.",
      "",
      "The status code must exactly match the one documented for that path.",
      "",
      "Expected value for a missing resource: 404, with a body carrying a code field and a message field.",
      "",
      "The response body must contain exactly the keys listed in the reference, in any order.",
      "",
      "If you cannot find the reference for a path, say so and move on.",
      ""
    )
  }
];
