// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { BlokKind } from "../classify/types.js";
import type { Range } from "../segment/types.js";

export type { Range };

/**
 * A blok: one thing the author meant, and every place in the source where they said it.
 *
 * `ranges` is **always an array**, even when a blok owns exactly one range (`CLAUDE.md` rule 5).
 * That is not defensive typing, it is the product: a rule stated in the opening paragraph and
 * restated in a numbered list at the end is *one* blok the user edits once, and every feature
 * downstream inherits the plural — failure attribution can point at three places at once, and
 * recompiling emits the rule in one place. A type that allowed a bare range would let a single-range
 * blok take a different shape from a multi-range one, and every consumer would then have to handle
 * both forever.
 *
 * Ranges are sorted by `start`, never overlap, and are **never coalesced** — two ranges stay two
 * even when they happen to be adjacent, because a coalesced range is the one way a blok could come
 * to cover text it does not own.
 */
export interface Blok {
  /**
   * `blok_` plus eight hex digits of a content hash over the kind and the ranges' offsets and text.
   * Derived from content rather than a counter, so re-running over the same input produces the same
   * ids and a diff of two runs is empty rather than renumbered.
   */
  readonly id: string;
  readonly kind: BlokKind;
  readonly ranges: readonly Range[];
}
