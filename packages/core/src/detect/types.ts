// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Range } from "../segment/types.js";

/**
 * Six, and the sixth was an epic rather than a patch.
 *
 * EPIC-012a's decision 3 said "exactly five", scoped to that epic; EPIC-012b's decision 2 adds
 * `rule_without_check` as the planned sixth and the last one in Stage 1. Every kind is a promise to
 * the reader about what this panel does and does not look for, which is why the count is defended
 * at all: a seventh is another epic.
 */
export type FindingKind =
  | "repeated"
  | "contradiction"
  | "untestable"
  | "padding"
  | "too_long"
  | "rule_without_check";

/**
 * How likely the finding is to be **real and costly** — not how confident the detector feels.
 *
 * A detector that is certain about something harmless is `low`. It maps to nothing in the colour
 * system except through EPIC-013's own decisions (decision 4): green, red and amber mean pass, fail
 * and drift, and severity is none of those.
 */
export type Severity = "high" | "medium" | "low";

/** One specific, defensible problem, pointing at the text that causes it. */
export interface Finding {
  /** Content-derived and stable, so a user can share a link to a finding. */
  readonly id: string;
  readonly kind: FindingKind;
  readonly severity: Severity;
  /**
   * Product copy, for a senior engineer who is busy and slightly sceptical. Specific, quoting or
   * pointing at the text, never scolding. Goes through the ADR-003 forbidden-word grep.
   */
  readonly message: string;
  /**
   * Every blok involved, deduplicated. A cross-blok contradiction names two; a contradiction the
   * clustering hid *inside* one blok names one, which is the case EPIC-011a carried forward.
   */
  readonly bloks: readonly string[];
  /** The exact spans the UI highlights. Always within the source's bounds. */
  readonly ranges: readonly Range[];
  /** A concrete rewrite or "add a check for this" — never "consider revising". */
  readonly suggestion?: string;
}
