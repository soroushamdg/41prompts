// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Public surface of `@41prompts/core`. The classifier, clustering, detectors, compiler, checks,
 * graders and artifact schema land in the rest of Stage 1 and Stage 2.
 */
export const CORE_VERSION = "0.0.1";

export * from "./budgets.js";

// The segmenter (EPIC-010). `segment()` and its offsets are a public contract from the moment
// the SDK exists: see `segment/types.ts` for what the offsets are counted in, and
// `segment/README.md` for the rule order.
export { segment } from "./segment/segment.js";
export { LIST_MIN_ITEMS, SENTENCE_SPLIT_THRESHOLD } from "./segment/constants.js";
export { checkSegmentInvariants } from "./segment/invariants.js";
export type { InvariantViolation } from "./segment/invariants.js";
export type { Segment, SegmentFixture } from "./segment/types.js";

// The committed corpus, exported so EPIC-011a's clustering tests and EPIC-013's UI fixtures read
// the same 25 prompts these snapshots were built from rather than three drifting copies
// (epic decision 8). Tree-shaken out of any consumer that does not name it.
export { SEGMENT_FIXTURES, findSegmentFixture } from "./segment/fixtures/index.js";
