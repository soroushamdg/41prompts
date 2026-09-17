// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * What the SDK holds for one prompt (EPIC-052).
 *
 * An artifact and the marker facts that came with it. The two are kept together because they were
 * true together: `version` is the N a person reads as "Live v7" and it lives on the **marker**, not
 * on the artifact — `artifact/schema.ts` puts it there deliberately, because an artifact is
 * immutable and the same bytes can be Live twice with two different numbers in front of them.
 *
 * The consequence, which surfaces to a caller: a **bundled** artifact has no marker, so its
 * `version` is `null`. That is honest rather than unfortunate. Whoever ran `41p pull` knows which
 * version they bundled; the artifact itself does not, and inventing a number here would be the SDK
 * asserting something nobody told it.
 */

import type { Artifact } from "@41prompts/core";

export interface Entry {
  readonly artifact: Artifact;
  /** From the Live marker, or `null` for a bundled artifact. */
  readonly version: number | null;
  /** From the Live marker, or `null`. ISO 8601, second precision. */
  readonly publishedAt: string | null;
  /** The `ETag` the marker response carried, for the next conditional request. */
  readonly etag: string | null;
}
