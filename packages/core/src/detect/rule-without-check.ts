// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { MERGE_OVERLAP_THRESHOLD, normalise, overlap } from "../cluster/similarity.js";
import { topicOf } from "../cluster/topics.js";
import type { Blok } from "../cluster/types.js";
import { trimmedSentenceRanges } from "../segment/sentences.js";
import type { Range } from "../segment/types.js";
import { MAX_RULES_WITHOUT_CHECKS } from "./constants.js";
import ruleShapesData from "./rule-shapes.json" with { type: "json" };
import { makeFinding, quote } from "./shared.js";
import type { Finding, Severity } from "./types.js";
import { untestablePhraseIn } from "./untestable.js";

// ── rule_without_check ───────────────────────────────────────────────────────────────────────
//
// The rule this prompt states and nothing verifies. The sixth finding, and the one that connects
// the decompiler to the rest of the product: it is the argument for expected bloks, for checks and
// for the publish gate, made about the reader's own prompt before they have signed up for anything.
//
// **The measurement that shaped every decision here:** not one of the 25 EPIC-010 corpus prompts
// contains a single `expected` blok. "No check covers this rule" is therefore true of every rule in
// every real prompt, and a detector that reported it once per rule would produce sixty findings on
// the corpus and turn the panel into a wall. So the useful question is not *which rules lack
// checks* — all of them do — but **which rules are worth naming**.
//
// The answer, and the shape of this file: fire only where the check that would cover it can be
// named. `rule-shapes.json` does three jobs at once — it is the test for "verifiable" (decision 3),
// it supplies the severity (decision 5), and it writes the suggestion (decision 6). One consequence
// is structural rather than editorial: this detector *cannot* fire without being able to say what
// check to add.

interface RuleShape {
  readonly id: string;
  /** ADR-003's plain phrase for the check that would cover this rule. Never an identifier. */
  readonly check: string;
  readonly severity: Severity;
  readonly test: RegExp;
}

/** File order is precedence: the most specific shape wins, and that decides which rule is quoted. */
const SHAPES: readonly RuleShape[] = ruleShapesData.map((row) => ({
  id: row.id,
  check: row.check,
  severity: row.severity as Severity,
  test: new RegExp(row.pattern, row.flags)
}));

interface Candidate {
  readonly blok: Blok;
  readonly shape: RuleShape;
  readonly rank: number;
  /** The sentence that matched the winning shape — what the message quotes. */
  readonly quoted: Range;
  /** Every sentence in this blok a shape matched, sorted. What the UI highlights. */
  readonly ranges: readonly Range[];
}

/**
 * The kinds whose findings silence this one where they overlap.
 *
 * Not every kind, and the line is not arbitrary. This finding says *nothing verifies this rule*, and
 * its suggestion is always "add a check". That advice is unusable while another finding says the
 * rule **cannot be verified** (`untestable`) or **should not be believed as stated**
 * (`contradiction`) — the reader has to resolve those first, and stacking "add a check for this" on
 * top of "these two cannot both hold" puts three findings on one problem. EPIC-012a drew the same
 * line when `repeated` declined to fire on a polarity mismatch.
 *
 * It is deliberately *not* silenced by `padding`, `too_long` or `repeated`. Those say the rule is
 * wordy, large or duplicated — all compatible with "and nothing checks it", and the JSON rule inside
 * `fires-padding` is a case where both findings are worth having.
 */
const SILENCING_KINDS: ReadonlySet<string> = new Set(["untestable", "contradiction"]);

/** The same order `detect()` sorts the panel by, so the two never disagree about what comes last. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = { high: 0, medium: 1, low: 2 };

export function detectRuleWithoutCheck(
  bloks: readonly Blok[],
  source: string,
  found: readonly Finding[] = []
): Finding[] {
  const claimed: Range[] = found
    .filter((finding) => SILENCING_KINDS.has(finding.kind))
    .flatMap((finding) => finding.ranges.map((range) => ({ start: range.start, end: range.end })));
  const isClaimed = (range: Range): boolean =>
    claimed.some((other) => range.start < other.end && other.start < range.end);

  // Coverage is asked of `expected` bloks only. That is decision 3 read literally, and it is also
  // the only reading that means anything: an `expected` blok is what EPIC-030 turns into a check,
  // so it is the only kind whose presence makes a rule verified rather than merely restated.
  const checks = bloks
    .filter((blok) => blok.kind === "expected")
    .map((blok) => {
      const text = blok.ranges.map((range) => source.slice(range.start, range.end)).join("\n");
      return { topic: topicOf(text), vocabulary: normalise(text) };
    });

  const candidates: Candidate[] = [];

  for (const blok of bloks) {
    if (blok.kind !== "constraint") continue;

    let best: RuleShape | null = null;
    let bestRank = SHAPES.length;
    let quoted: Range | null = null;
    let silenced = false;
    const ranges: Range[] = [];

    for (const range of blok.ranges) {
      // **The whole range, vetoed by one phrase anywhere in it.** `untestable` claims ranges, so
      // skipping the range rather than the sentence makes the two findings non-overlapping and not
      // merely non-identical — a stronger guarantee than decision 3's "not for the same range", and
      // one a reader can see: they never get a highlight inside a highlight saying the opposite
      // thing.
      if (untestablePhraseIn(source.slice(range.start, range.end)) !== null) continue;

      for (const sentence of trimmedSentenceRanges(source, range.start, range.end)) {
        const text = source.slice(sentence.start, sentence.end);
        const rank = SHAPES.findIndex((shape) => shape.test.test(text));
        if (rank === -1) continue;
        // One silenced sentence silences the blok, not just that sentence — the same all-or-nothing
        // rule the untestable veto above uses, and for the same reason: a blok is one thing the
        // reader edits, so a finding that covered half of it would point at a rule they are already
        // being told something else about.
        //
        // Carried in a flag rather than by clearing `best`. Self-review found the version that
        // cleared it: when the *first* matching sentence was the claimed one, nothing had been
        // pushed yet, so the outer loop's "did we lose a `best`?" test was false and a later range
        // of the same blok could set `best` again — the blok fired after all, from a different
        // sentence, which is exactly what this guard exists to prevent.
        if (isClaimed(sentence)) {
          silenced = true;
          break;
        }
        ranges.push(sentence);
        if (rank < bestRank) {
          bestRank = rank;
          best = SHAPES[rank]!;
          quoted = sentence;
        }
      }
      if (silenced) break;
    }

    if (silenced || best === null || quoted === null) continue;

    // Whether an `expected` blok already covers this rule (decision 4). Generous on purpose: the
    // failure that matters is telling somebody who wrote a check that they have not, so this reuses
    // clustering's measure and threshold but **not** `MAX_VOCABULARY_RATIO`. That guard exists to
    // stop clustering over-merging; here the two failures point the other way, and a loose match
    // costs a missed pitch where a strict one costs trust.
    const ruleText = ranges.map((range) => source.slice(range.start, range.end)).join("\n");
    const ruleTopic = topicOf(ruleText);
    const ruleVocabulary = normalise(ruleText);
    const covered = checks.some(
      (check) =>
        (ruleTopic !== null && check.topic === ruleTopic) ||
        overlap(check.vocabulary, ruleVocabulary) >= MERGE_OVERLAP_THRESHOLD
    );
    if (covered) continue;

    ranges.sort((left, right) => left.start - right.start);
    candidates.push({ blok, shape: best, rank: bestRank, quoted, ranges });
  }

  // Decision 7: a prompt with twenty rules and no checks must not produce twenty findings. Ranked
  // by severity, then by how machine-checkable the rule is (shape precedence), then by position, so
  // the three that survive are the three whose checks are most obviously writable today.
  candidates.sort((left, right) => {
    if (SEVERITY_RANK[left.shape.severity] !== SEVERITY_RANK[right.shape.severity]) {
      return SEVERITY_RANK[left.shape.severity] - SEVERITY_RANK[right.shape.severity];
    }
    if (left.rank !== right.rank) return left.rank - right.rank;
    return left.quoted.start - right.quoted.start;
  });

  const shown = candidates.slice(0, MAX_RULES_WITHOUT_CHECKS);
  const remainder = candidates.length - shown.length;

  // Which of the reported findings the reader sees **last**, which is where the count of the ones
  // not listed belongs — it reads as a closing line there and as a forward reference anywhere else.
  // `detect()` sorts the panel by severity and then by first range, so that order has to be
  // recomputed here rather than assumed to be the ranking above: ranked by how machine-checkable a
  // rule is, the last of the three is often the first one on screen, and "2 more rules here have no
  // check either" printed immediately above two more rules with no check is a sentence that makes
  // the reader count wrong.
  const displayLast = shown
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.candidate.shape.severity] - SEVERITY_RANK[right.candidate.shape.severity] ||
        left.candidate.ranges[0]!.start - right.candidate.ranges[0]!.start
    )
    .at(-1)?.index;

  return shown.map((candidate, index) => {
    const tail =
      remainder > 0 && index === displayLast
        ? ` ${remainder} more ${remainder === 1 ? "rule" : "rules"} here ${remainder === 1 ? "has" : "have"} no check either.`
        : "";
    return makeFinding(
      "rule_without_check",
      candidate.shape.severity,
      [candidate.blok.id],
      candidate.ranges,
      {
        message: `Nothing checks this rule: ${quote(source, candidate.quoted)} If the model stops following it, nothing fails.${tail}`,
        suggestion: `Add a ${JSON.stringify(candidate.shape.check)} check.`
      }
    );
  });
}

/** Every committed pattern in this module, for the pattern-safety test. */
export function ruleShapePatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return ruleShapesData.map((row) => ({ id: `rule-shape:${row.id}`, pattern: row.pattern, flags: row.flags }));
}
