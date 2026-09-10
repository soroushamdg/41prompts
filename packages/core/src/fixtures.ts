// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `@41prompts/core/fixtures` — every committed corpus in this package, in one place.
 *
 * A subpath rather than the package root: this is real, shared test data, and the root is the
 * surface EPIC-052 freezes. EPIC-011a's clustering fixtures, EPIC-012a's detector fixtures and
 * EPIC-013's UI fixtures all read from here, so a boundary or a merge changing shows up in one diff
 * instead of in three drifting copies of sample text.
 */

export { SEGMENT_FIXTURES, findSegmentFixture } from "./segment/fixtures/index.js";
export { CLUSTER_FIXTURES } from "./cluster/fixtures/prompts.js";
export { generatePrompt, NAMED_EDGE_CASES } from "./segment/fixtures/generate.js";
export { SUMMARY_CONTRACT_CASES } from "./summarise/contract.js";
export type { ContractCase } from "./summarise/contract.js";
export type { SegmentFixture } from "./segment/types.js";
