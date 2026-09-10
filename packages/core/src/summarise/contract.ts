// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";
import { summaryInputHash } from "./hash.js";
import type { Summary } from "./types.js";

/**
 * The contract every summariser has to satisfy, as data and a pure function.
 *
 * `packages/core` imports no test framework, so the shared suite cannot be a `describe` block. It is
 * a list of cases and a checker instead — the same shape as `checkSegmentInvariants` and
 * `checkBlokInvariants` — and `packages/core` and `apps/worker` each run the identical list over
 * their own implementation. One file, two callers, no drift.
 */

/** One broken promise, named well enough to fix without a debugger. */
export interface ContractViolation {
  readonly rule: string;
  readonly detail: string;
}

export interface ContractCase {
  readonly name: string;
  readonly blok: Blok;
  readonly source: string;
}

function blokOf(kind: Blok["kind"], source: string, ranges: ReadonlyArray<[number, number]>): Blok {
  return {
    id: "blok_0000000000000000",
    kind,
    ranges: ranges.map(([start, end]) => ({ start, end }))
  };
}

const WALL = "w".repeat(10_000);
const DISAGREE = "Always reply in French.\n\nNever reply in French on the audit channel.";

/**
 * The inputs any implementation has to survive.
 *
 * Decision 9 names four of these — empty, whitespace-only, single-word, and a 10,000-character blok
 * — and they are here because they are the shapes that make a summariser throw: a first sentence
 * that does not exist, a truncation on a string with no space to truncate at, an index into nothing.
 */
export const SUMMARY_CONTRACT_CASES: readonly ContractCase[] = [
  { name: "empty source", blok: blokOf("context", "", [[0, 0]]), source: "" },
  { name: "whitespace-only blok", blok: blokOf("context", "   \n\t  ", [[0, 7]]), source: "   \n\t  " },
  { name: "single word", blok: blokOf("context", "Summarise", [[0, 9]]), source: "Summarise" },
  { name: "single character", blok: blokOf("constraint", "x", [[0, 1]]), source: "x" },
  { name: "no ranges at all", blok: blokOf("context", "anything", []), source: "anything" },
  {
    name: "a 10,000-character blok with no sentence end",
    blok: blokOf("context", WALL, [[0, WALL.length]]),
    source: WALL
  },
  {
    name: "an ordinary one-sentence rule",
    blok: blokOf("constraint", "Always respond in JSON only.", [[0, 28]]),
    source: "Always respond in JSON only."
  },
  {
    name: "a multi-range blok whose ranges agree",
    blok: blokOf("constraint", "Reply in French.\n\nReply in French.", [
      [0, 16],
      [18, 34]
    ]),
    source: "Reply in French.\n\nReply in French."
  },
  {
    name: "a multi-range blok whose ranges disagree",
    blok: blokOf("constraint", DISAGREE, [
      [0, 23],
      [25, DISAGREE.length]
    ]),
    source: DISAGREE
  },
  {
    name: "text with only punctuation",
    blok: blokOf("constraint", "... !!! ???", [[0, 11]]),
    source: "... !!! ???"
  },
  {
    name: "a lone surrogate",
    blok: blokOf("context", "before \uD800 after", [[0, 15]]),
    source: "before \uD800 after"
  }
];

/**
 * Re-derive every promise a `Summary` makes, from the blok, the source and the summary alone.
 *
 * Returns an empty array when everything holds. Note what is *not* checked: whether the summary is
 * any good. That is not a property, it is a judgement, and this epic's own goal says quality gets
 * tuned for a year. What can be checked is that the summary is present, bounded, honest about where
 * it came from, correctly keyed, and — the one that matters most — **not a substitute for the
 * source text**.
 */
export function checkSummaryContract(
  blok: Blok,
  source: string,
  summary: Summary,
  expectedVersion: string
): ContractViolation[] {
  const violations: ContractViolation[] = [];

  if (typeof summary.text !== "string") {
    violations.push({ rule: "text-is-a-string", detail: `got ${typeof summary.text}` });
  }

  // Decision 1: `source` is required and is never inferred. A summariser that forgets it, or that
  // returns something outside the union, is not usable by a UI that has to say where it came from.
  if (summary.source !== "heuristic" && summary.source !== "model") {
    violations.push({
      rule: "source-is-present-and-known",
      detail: `source must be "heuristic" or "model", got ${JSON.stringify(summary.source)}`
    });
  }

  if (!/^[0-9a-f]{16}$/.test(summary.inputHash)) {
    violations.push({
      rule: "input-hash-is-a-hash",
      detail: `expected sixteen hex digits, got ${JSON.stringify(summary.inputHash)}`
    });
  } else if (summary.inputHash !== summaryInputHash(blok, source, expectedVersion)) {
    violations.push({
      rule: "input-hash-matches-the-content",
      detail: "the summary's cache key is not the hash of the blok it summarises"
    });
  }

  if (summary.text.length > MAX_REASONABLE_SUMMARY) {
    violations.push({
      rule: "summary-is-bounded",
      detail: `${summary.text.length} characters — a summary that has to be scrolled is not a summary`
    });
  }

  if (summary.text.includes("\n")) {
    violations.push({ rule: "summary-is-one-line", detail: "a summary spans one line on a card" });
  }

  // `CLAUDE.md` rule 3, as a property. A summary that reproduces the blok's whole text is not
  // metadata about it, it is a copy of it — and a copy is the first step towards something
  // downstream treating it as the text itself.
  const blokText = blok.ranges.map((range) => source.slice(range.start, range.end)).join("\n");
  if (blokText.trim().length > MAX_REASONABLE_SUMMARY && summary.text.includes(blokText.trim())) {
    violations.push({
      rule: "summary-is-not-the-text",
      detail: "the summary contains the blok's entire source text"
    });
  }

  return violations;
}

/**
 * The longest a summary may be, whatever produced it.
 *
 * Not the same number as the heuristic's own truncation constant, on purpose: this is the contract's
 * outer bound, which a model-backed implementation with a different house style still has to respect.
 */
export const MAX_REASONABLE_SUMMARY = 200;
