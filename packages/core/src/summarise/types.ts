// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";

/**
 * A short description of what a blok says, for a user scanning a canvas of forty cards.
 *
 * **A summary is metadata about the text, never a replacement for it** (`CLAUDE.md` rule 3). The
 * compiler never emits it; no feature may substitute it for the blok's verbatim source. There is a
 * placeholder test — `never-compiled.test.ts` — that fails loudly the moment a compiler exists, so
 * whoever builds EPIC-020 has to finish the assertion rather than discover the rule later.
 */
export interface Summary {
  /** The summary itself. Mechanical, never a paraphrase of what the author meant. */
  readonly text: string;
  /**
   * Where this came from. **Required, and never inferred** (decision 1): a caller can always tell a
   * mechanical summary from a model's, and EPIC-013 shows it rather than presenting both alike.
   */
  readonly source: "heuristic" | "model";
  /**
   * The cache key. Covers everything the summariser read — see `hash.ts`, which explains what is in
   * it and, more importantly, what is deliberately left out.
   */
  readonly inputHash: string;
}

/**
 * Anything that can summarise a blok.
 *
 * `version` is part of the cache key, so changing what an implementation produces — a reworded
 * prompt, a different truncation, a new kind prefix — means bumping it, and every cached summary
 * from the old behaviour stops being found. That is the whole mechanism: there is no cache
 * invalidation to remember, only a version to change.
 */
export interface Summariser {
  readonly version: string;
  summarise(blok: Blok, source: string): Summary;
}

/**
 * The same contract for an implementation that has to go somewhere to get its answer.
 *
 * Deliberately a second type rather than making `Summariser` async. The heuristic is synchronous and
 * pure; wrapping it in a promise to match a model call would make every caller in `packages/core`
 * await something that never yields, and would hide the fact that one of these can fail and the
 * other cannot. Two honest shapes beat one that pretends.
 */
export interface AsyncSummariser {
  readonly version: string;
  summarise(blok: Blok, source: string): Promise<Summary>;
}
