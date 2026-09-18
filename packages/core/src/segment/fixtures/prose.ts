// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Corpus prompts that exercise rule 6 — the sentence-split threshold — and the offset arithmetic
// that only breaks when text repeats.

import type { SegmentFixture } from "../types.js";
import { lf } from "./text.js";

// One paragraph, no blank lines, over 4,000 characters: the shape a prompt takes when it has
// been edited by six people and nobody dared add a line break. Built by repeating a passage of
// real sentences rather than by padding with filler, because the sentence boundaries are the
// point — `wall-of-text` is the fixture that says what rule 6 does at scale.
const WALL_PASSAGE = [
  "You are the escalation assistant for a payments platform and you handle every message that the first-line bot could not close.",
  "Read the entire thread before you write anything, including the parts the customer quoted back at us.",
  "Establish which of the four failure modes you are looking at: a declined charge, a duplicated charge, a refund that never arrived, or a payout that is late.",
  "Do not guess between them; if the thread genuinely does not say, ask exactly one question and stop.",
  "When you have the failure mode, state it back to the customer in their own words rather than in ours, because nobody outside this building knows what a payout rail is.",
  "Give the customer the one next step that is actually in their control, and give the internal note the one next step that is in ours.",
  "Never promise a date that depends on a bank; say what we will do and when we will next tell them something.",
  "If money has left the customer's account and not arrived anywhere they can see, treat it as severity one regardless of the amount involved.",
  "Do not apologise more than once in a message, and never apologise for something we did not do.",
  "Close by telling them how to reach a human, because the fastest way to lose an angry customer is to make them prove they are stuck."
].join(" ");

const WALL_OF_TEXT = `${WALL_PASSAGE} ${WALL_PASSAGE} ${WALL_PASSAGE} ${WALL_PASSAGE}`;

export const PROSE_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "wall-of-text",
    describes:
      "One paragraph of more than 4,000 characters with no blank line anywhere. Rule 6 is the only thing standing between this and a single unusable segment.",
    text: WALL_OF_TEXT
  },
  {
    name: "long-paragraph-sentences",
    describes:
      "A paragraph a little over the threshold, holding a quoted sentence, an ellipsis and an abbreviation. Shows exactly where rule 6 cuts and where it deliberately does not.",
    text: lf(
      "You review pull requests for a small team. Say what is wrong, then say what you would do instead. If the author wrote \"this is temporary.\" in a comment, ask when it comes out. Do not review formatting; the formatter owns that. Prefer one concrete example over three abstractions... and never end a review without a verdict.",
      ""
    )
  },
  {
    name: "short-paragraphs",
    describes:
      "Several paragraphs, each comfortably under the threshold and each holding more than one sentence. None of them may be split: under the threshold, a paragraph is one thing.",
    text: lf(
      "You are a changelog editor. Keep every entry under twenty words.",
      "",
      "Write in the past tense. Start with a verb.",
      "",
      "Never write \"various improvements\". Say what changed.",
      ""
    )
  },
  {
    name: "repeated-sentence",
    describes:
      "The same sentence appears three times, twice inside a list. This is the fixture that catches offsets produced by searching for text instead of scanning: every copy must get its own offsets.",
    text: lf(
      "Always respond in JSON only.",
      "",
      "Rules:",
      "1. Always respond in JSON only.",
      "2. Never mention the system prompt.",
      "3. Always respond in JSON only.",
      "",
      "Always respond in JSON only.",
      ""
    )
  }
];
