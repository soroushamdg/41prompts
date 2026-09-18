// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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
  for (const [start, end] of ranges) {
    // `slice` clamps, so an off-by-one here would pass silently rather than fail — which is exactly
    // what happened to the lone-surrogate case, whose range ran one unit past its source and was
    // caught in review rather than by this suite.
    if (start < 0 || end > source.length || end < start) {
      throw new Error(`contract case range ${start}..${end} is outside its ${source.length}-unit source`);
    }
  }
  return {
    id: "blok_0000000000000000",
    kind,
    ranges: ranges.map(([start, end]) => ({ start, end }))
  };
}

/** A single-range case covering the whole of its source, so no offset is ever written by hand. */
function wholeOf(kind: Blok["kind"], name: string, source: string): ContractCase {
  return { name, blok: blokOf(kind, source, [[0, source.length]]), source };
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
  wholeOf("context", "empty source", ""),
  wholeOf("context", "whitespace-only blok", "   \n\t  "),
  wholeOf("context", "single word", "Summarise"),
  wholeOf("constraint", "single character", "x"),
  { name: "no ranges at all", blok: blokOf("context", "anything", []), source: "anything" },
  wholeOf("context", "a 10,000-character blok with no sentence end", WALL),
  wholeOf("constraint", "an ordinary one-sentence rule", "Always respond in JSON only."),
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
  wholeOf("constraint", "text with only punctuation", "... !!! ???"),
  wholeOf("context", "a lone surrogate", "before \uD800 after"),
  // Positioned so a cut at SUMMARY_MAX_LENGTH - 1 lands *between* the surrogates, and with no space
  // anywhere for the word-boundary fallback to rescue it. An earlier version of this case put the
  // pair where the cut happened to miss it and proved nothing.
  wholeOf("context", "an astral emoji astride the truncation boundary", `${"n".repeat(82)}\uD83D\uDE80${"n".repeat(20)}`)
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
    // Returned immediately rather than collected: every check below reads `summary.text`, and a
    // checker that throws a TypeError on exactly the input it was written to report is worse than
    // no checker. Found in review.
    return [{ rule: "text-is-a-string", detail: `got ${typeof summary.text}` }];
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

  // Decision 9: every input produces a *valid* summary, and a blank card reads as a bug in the blok
  // rather than in the summariser, which sends the reader looking in the wrong place. Both
  // implementations enforce this privately; the shared contract is where it belongs, or the
  // anti-drift mechanism does not cover the one invariant they both happen to agree on.
  if (summary.text.length === 0) {
    violations.push({ rule: "summary-is-not-empty", detail: "every blok gets a summary, including an empty one" });
  }

  if (summary.text.length > MAX_REASONABLE_SUMMARY) {
    violations.push({
      rule: "summary-is-bounded",
      detail: `${summary.text.length} characters — a summary that has to be scrolled is not a summary`
    });
  }

  // Every character that makes a renderer start a new line, not just `\n`. A summary that renders on
  // two lines breaks a card layout whatever the character responsible was called.
  const lineBreak = /[\n\r\v\f\u0085\u2028\u2029]/.exec(summary.text);
  if (lineBreak !== null) {
    violations.push({
      rule: "summary-is-one-line",
      detail: `contains U+${lineBreak[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}; a summary spans one line on a card`
    });
  }

  // A truncation must not cut a character in half. Checked across the whole summary rather than at
  // its end: the first version of this looked only at the last character and missed the real case,
  // where truncation left the lone surrogate immediately *before* an appended ellipsis.
  //
  // Text arriving from a prompt may legitimately contain a lone surrogate — EPIC-010's corpus has
  // one — so this only flags a surrogate the summariser itself orphaned, which is any unpaired one
  // that was paired in the blok's own text.
  const orphaned = firstOrphanedSurrogate(summary.text);
  if (orphaned !== null && !firstOrphanedSurrogate(blokTextOf(blok, source))) {
    violations.push({
      rule: "summary-keeps-characters-whole",
      detail: `U+${orphaned.toString(16).toUpperCase()} at the cut — a truncation split a surrogate pair`
    });
  }

  return violations;
}

function blokTextOf(blok: Blok, source: string): string {
  return blok.ranges.map((range) => source.slice(range.start, range.end)).join("\n");
}

/** The first surrogate with no partner, or `null`. */
function firstOrphanedSurrogate(text: string): number | null {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
        continue;
      }
      return code;
    }
    if (code >= 0xdc00 && code <= 0xdfff) return code;
  }
  return null;
}

/**
 * The longest a summary may be, whatever produced it.
 *
 * Not the same number as the heuristic's own truncation constant, on purpose: this is the contract's
 * outer bound, which a model-backed implementation with a different house style still has to respect.
 *
 * ## There is no "the summary is not the text" check here, and there cannot be
 *
 * There was one. It asked whether the summary contained the blok's whole text, and it was
 * unreachable — the guard threshold and this bound were the same number, so any summary short enough
 * to be valid was too short to contain anything longer than it. Found in review.
 *
 * Making it reachable would have made it wrong. For a one-sentence blok the heuristic's summary *is*
 * the blok's text, prefixed — "Rule: Always respond in JSON only." — and that is correct behaviour,
 * not a violation. `CLAUDE.md` rule 3 is about what the **compiler** emits, and a summary cannot
 * tell you on its own whether something downstream is about to substitute it for the source. That
 * guard lives where it can actually be enforced: `never-compiled.test.ts`.
 */
export const MAX_REASONABLE_SUMMARY = 200;
