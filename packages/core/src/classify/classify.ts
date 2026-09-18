// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Segment } from "../segment/types.js";
import heuristicsData from "./heuristics.json" with { type: "json" };
import type { BlokKind, Classification } from "./types.js";

/** One row of `heuristics.json`, compiled once. */
interface Heuristic {
  readonly id: string;
  readonly kind: BlokKind;
  readonly confidence: number;
  readonly test: RegExp;
}

// Compiled once at module load, in file order. First match wins (decision 4), so the file's order
// *is* the precedence and changing the order changes behaviour — which is why the order is
// documented in `README.md` next to the reasons rather than only implied by the data.
const HEURISTICS: readonly Heuristic[] = heuristicsData.map((row) => ({
  id: row.id,
  kind: row.kind as BlokKind,
  confidence: row.confidence,
  test: new RegExp(row.pattern, row.flags)
}));

// A leading list marker is punctuation, not content. "2. Set a priority" is the same rule as "Set
// a priority", and every `^`-anchored heuristic would otherwise miss every numbered rule in every
// prompt — which is most of the rules in most prompts.
const LEADING_MARKER = /^[ \t]*(?:[-*+•][ \t]+|\d{1,9}[.)][ \t]+)/;

/**
 * Decide what kind of blok a segment belongs to.
 *
 * Ordered heuristics from `heuristics.json`, first match wins. No model is involved and none will
 * be without an ADR (`CLAUDE.md` rule 2): a kind decides how text compiles, and a compilation that
 * changed because a model was in a different mood is not a prompt layer, it is a liability.
 *
 * The returned `matched` is the id of the heuristic that fired, so a wrong answer names the rule
 * to go and look at. The returned `confidence` orders classifications by how specific the evidence
 * was; it is not a probability and nothing in this package divides by it.
 *
 * Falls through to `context` at low confidence, which is the safe default: context compiles to
 * text unchanged, so a wrong `context` costs a label, where a wrong `expected` invents a check.
 */
export function classify(segment: Segment): Classification {
  const text = segment.text.replace(LEADING_MARKER, "");

  for (const heuristic of HEURISTICS) {
    if (heuristic.test.test(text)) {
      return { kind: heuristic.kind, confidence: heuristic.confidence, matched: heuristic.id };
    }
  }

  // Unreachable: the last row of `heuristics.json` matches everything. Kept as a real branch
  // rather than a non-null assertion so that a data edit which deletes the default row fails
  // loudly here instead of returning `undefined` to every caller.
  return { kind: "context", confidence: 0, matched: "context-fallthrough" };
}

/** The compiled heuristics, in precedence order. Exported for the pattern-safety test. */
export function heuristicPatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return heuristicsData.map((row) => ({ id: row.id, pattern: row.pattern, flags: row.flags }));
}
