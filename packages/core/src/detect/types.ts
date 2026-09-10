// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Range } from "../segment/types.js";

/**
 * Exactly five (decision 3). Not four, not six — adding a sixth is an epic, not a patch, because
 * every kind is a promise to the reader about what this panel does and does not look for.
 */
export type FindingKind = "repeated" | "contradiction" | "untestable" | "padding" | "too_long";

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
