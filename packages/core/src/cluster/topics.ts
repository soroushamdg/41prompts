// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Topic keys, extracted from `cluster.ts` so there is exactly one answer to "are these two pieces
// of text about the same thing?" in this package.
//
// EPIC-011a used them to decide merges. EPIC-012b's `rule_without_check` uses the same keys to
// decide whether an `expected` blok covers a rule, because its decision 4 says to reuse this
// machinery rather than invent a second similarity measure — and a second one would let a rule be
// "about the same thing as this check" and "not about the same thing" at once.

import topicsData from "./topics.json" with { type: "json" };

interface Topic {
  readonly key: string;
  readonly test: RegExp;
}

const TOPICS: readonly Topic[] = topicsData.map((row) => ({
  key: row.key,
  test: new RegExp(row.pattern, row.flags)
}));

/** The first topic key that matches, or `null`. File order is precedence. */
export function topicOf(text: string): string | null {
  for (const topic of TOPICS) {
    if (topic.test.test(text)) return topic.key;
  }
  return null;
}

/** Every committed topic pattern, for the pattern-safety test. */
export function topicPatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return topicsData.map((row) => ({ id: `topic:${row.key}`, pattern: row.pattern, flags: row.flags }));
}
