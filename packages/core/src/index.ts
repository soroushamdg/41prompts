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
export type { Segment } from "./segment/types.js";

// The classifier and clustering (EPIC-011a). `classify()` gives a segment a kind; `cluster()`
// turns a flat list of segments into bloks, each owning a *set* of ranges — the step that makes a
// rule stated in three places one thing the user edits once.
export { classify } from "./classify/classify.js";
export { BLOK_KINDS } from "./classify/types.js";
export type { BlokKind, Classification } from "./classify/types.js";
export { cluster, MERGE_OVERLAP_THRESHOLD } from "./cluster/cluster.js";
export { checkBlokInvariants } from "./cluster/invariants.js";
export type { Blok } from "./cluster/types.js";
export type { Range } from "./segment/types.js";

// The committed 25-prompt corpus is NOT here. It is real and it is shared — EPIC-011a's
// clustering tests and EPIC-013's UI fixtures read the same prompts these snapshots were built
// from, rather than three drifting copies (epic decision 8) — but it is test data, and this
// module is the surface EPIC-052 freezes. It lives one subpath away:
//
//     import { SEGMENT_FIXTURES } from "@41prompts/core/fixtures";
