// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { BlokKind } from "../classify/types.js";
import type { Blok } from "../cluster/types.js";
import { summaryInputHash } from "./hash.js";
import type { Summariser, Summary } from "./types.js";

/**
 * How long a summary may be before it is truncated, ellipsis included.
 *
 * 84 characters, from the decompiler prototype, which is about what fits on one line of a blok card
 * without wrapping. A named constant because it is a judgement that EPIC-013 may want to move once
 * there is a real card to measure against.
 */
export const SUMMARY_MAX_LENGTH = 84;

/**
 * Bump when the output changes — a new prefix, a different truncation, a changed boundary rule.
 *
 * This is the whole cache-invalidation mechanism (decision 5). Forget to bump it and every cached
 * summary from the previous behaviour stays reachable for ever; bump it and they all become
 * unreachable at once, with nothing to purge.
 */
export const HEURISTIC_SUMMARISER_VERSION = "heuristic@1";

/**
 * What each kind is called at the start of a summary.
 *
 * `context` gets nothing. It is the default kind — what a segment is when nothing more specific
 * fired — so prefixing it would put a confident label on the least confident classification in the
 * package.
 */
const KIND_PREFIX: Readonly<Record<BlokKind, string>> = {
  context: "",
  constraint: "Rule: ",
  example: "Example: ",
  expected: "Expected: ",
  image_ref: "Image: ",
  image_input: "Image input: "
};

/** What each kind is called when the summary has to talk *about* the blok rather than quote it. */
const KIND_NOUN: Readonly<Record<BlokKind, string>> = {
  context: "Context",
  constraint: "Rule",
  example: "Example",
  expected: "Expectation",
  image_ref: "Image reference",
  image_input: "Image input"
};

const LEADING_MARKER = /^[ \t]*(?:[-*+•][ \t]+|\d{1,9}[.)][ \t]+)/;

/**
 * A deliberately mechanical summariser.
 *
 * First sentence, kind-prefixed, truncated. It does not paraphrase, does not extract keywords, does
 * not score anything and does not guess what the author meant. That is the point rather than a
 * limitation: a summary that is obviously mechanical is safer than one that sounds confident and is
 * wrong, and EPIC-080 exists partly to find out how far users trust these at all. Every temptation
 * to make it cleverer should be resisted until that study says something.
 */
export const heuristicSummariser: Summariser = {
  version: HEURISTIC_SUMMARISER_VERSION,

  summarise(blok: Blok, source: string): Summary {
    return {
      text: summaryText(blok, source),
      source: "heuristic",
      inputHash: summaryInputHash(blok, source, HEURISTIC_SUMMARISER_VERSION)
    };
  }
};

function summaryText(blok: Blok, source: string): string {
  const fragments = blok.ranges
    .map((range) => source.slice(range.start, range.end))
    .map((text) => firstSentence(text))
    .filter((text) => text.length > 0);

  if (fragments.length === 0) {
    // Empty, whitespace-only, or no ranges at all. Decision 9: this returns a valid summary rather
    // than throwing, and says the one true thing available.
    return `${KIND_NOUN[blok.kind]}, no text`;
  }

  if (fragments.length === 1) {
    return truncate(KIND_PREFIX[blok.kind] + capitalise(fragments[0]!));
  }

  // Decision 8: a multi-range blok summarises the blok, not its first range.
  const agree = fragments.every((fragment) => fragment === fragments[0]);
  if (agree) {
    return truncate(KIND_PREFIX[blok.kind] + capitalise(fragments[0]!));
  }

  // The ranges say different things, so the summary says *less* rather than picking one. Showing
  // only the first would be lying by omission on a card whose whole job is to tell you what the
  // blok contains — and the count is the honest, useful fact: this rule is stated in more than one
  // place, which is itself the defect the product exists to surface.
  return truncate(`${KIND_NOUN[blok.kind]} stated in ${fragments.length} places`);
}

/**
 * Up to the first sentence terminator followed by whitespace, with a leading list marker and
 * surrounding whitespace removed, collapsed onto one line.
 *
 * The same boundary the segmenter's rule 6 uses, so a summary never cuts somewhere the segmenter
 * would not have.
 */
function firstSentence(text: string): string {
  const cleaned = text.replace(LEADING_MARKER, "").trim();
  if (cleaned.length === 0) return "";

  for (let i = 0; i < cleaned.length; i++) {
    const code = cleaned.charCodeAt(i);
    if (code !== 0x2e && code !== 0x21 && code !== 0x3f) continue;
    const after = cleaned.charCodeAt(i + 1);
    if (Number.isNaN(after) || after === 0x20 || after === 0x09 || after === 0x0a || after === 0x0d) {
      return collapse(cleaned.slice(0, i + 1));
    }
  }
  return collapse(cleaned);
}

/**
 * One line, single-spaced. A card has one line; newlines and runs of spaces are not information.
 *
 * "Newline" means every character that starts a new line in something — vertical tab, form feed,
 * U+0085, U+2028, U+2029 — not just `\n`. Found in review: a summary that renders on two lines
 * breaks a card layout whatever the character responsible happened to be called.
 */
function collapse(text: string): string {
  let out = "";
  let inWhitespace = false;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isLineBreakOrSpace(code)) {
      inWhitespace = true;
      continue;
    }
    if (inWhitespace && out.length > 0) out += " ";
    inWhitespace = false;
    out += text[i];
  }
  return out;
}

/** Truncate on a word boundary where there is one, and say so with an ellipsis. */
function truncate(text: string): string {
  if (text.length <= SUMMARY_MAX_LENGTH) return text;

  const cut = text.slice(0, safeCut(text, SUMMARY_MAX_LENGTH - 1));
  const lastSpace = cut.lastIndexOf(" ");
  // A long unbroken run — a URL, a wall of one word — has no word boundary to cut on, so it gets
  // cut mid-word rather than losing the whole summary to a search that found nothing.
  const body = lastSpace > SUMMARY_MAX_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${body}…`;
}

/**
 * `at`, moved back one if it would land between a surrogate pair.
 *
 * Slicing counts UTF-16 code units, and an astral character is two of them, so a cut at the wrong
 * index leaves half of one behind — which renders as a replacement glyph and makes the summary's own
 * text look like the bug. Found in review, on a case the suite had to be rebuilt to reach.
 */
function isLineBreakOrSpace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0b || // vertical tab
    code === 0x0c || // form feed
    code === 0x0d ||
    code === 0x85 || // next line
    code === 0x2028 || // line separator
    code === 0x2029 // paragraph separator
  );
}

function safeCut(text: string, at: number): number {
  const code = text.charCodeAt(at - 1);
  return code >= 0xd800 && code <= 0xdbff ? at - 1 : at;
}

function capitalise(text: string): string {
  if (text.length === 0) return text;
  const first = text.charAt(0);
  const upper = first.toUpperCase();
  // Only when it is unambiguous. `toUpperCase` is locale-independent for the characters where it
  // changes anything here, but a character whose upper case is longer than itself (ﬁ, ß) would
  // change the string's length, and a summariser must not silently rewrite text.
  return upper.length === first.length ? upper + text.slice(1) : text;
}
