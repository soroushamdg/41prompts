// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { SegmentFixture } from "../types.js";
import { ENCODING_FIXTURES } from "./encoding.js";
import { PROSE_FIXTURES } from "./prose.js";
import { STRUCTURE_FIXTURES } from "./structure.js";

/**
 * The committed segmentation corpus: 25 prompts, each with a snapshot in `snapshots/`.
 *
 * This is the shared truth for every later epic (epic decision 8). EPIC-011a's clustering tests
 * and EPIC-013's UI fixtures read these same prompts, so a boundary change shows up in one
 * place, in one diff, instead of in three sets of copy-pasted sample text that drift apart.
 *
 * It is TypeScript rather than a directory of `.txt` files for three reasons: `packages/core`
 * does no IO, so a loader would violate its own boundary rule; the invisible cases (CRLF, BOM,
 * a lone surrogate, a missing trailing newline) survive an editor and a `git` checkout as
 * escapes but not as bytes in a text file; and a module carries its own SPDX header.
 *
 * The order is fixed — structure, then encoding, then prose — because snapshot files are named
 * per fixture and a reader comparing two branches should see the same order in both.
 */
export const SEGMENT_FIXTURES: readonly SegmentFixture[] = [
  ...STRUCTURE_FIXTURES,
  ...ENCODING_FIXTURES,
  ...PROSE_FIXTURES
];

/**
 * The shape of a corpus prompt. Exported from here rather than from the package root: it is only
 * useful to someone who already has the fixtures, and the root is the surface EPIC-052 freezes.
 */
export type { SegmentFixture } from "../types.js";

/** Look up one corpus prompt by name. Returns `undefined` rather than throwing. */
export function findSegmentFixture(name: string): SegmentFixture | undefined {
  return SEGMENT_FIXTURES.find((fixture) => fixture.name === name);
}
