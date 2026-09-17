// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * What the application shipped with the deploy (EPIC-052).
 *
 * The third source in `CLAUDE.md` rule 8's order, and the one that makes *"stop the service; the app
 * still answers"* true on a machine that has never had a cache. An application imports a file of
 * artifact documents — `41p pull` will write it in EPIC-053 — and hands the array to `createClient`.
 *
 * ## A bad entry is dropped, not refused
 *
 * One malformed document in a bundled file must not take out the ones next to it. The deploy that
 * carries it is already out; refusing the whole array would turn a stale prompt into no prompt,
 * which is the opposite of what this source exists for. Every drop is warned about by name.
 */

import type { Entry } from "./entry.js";
import type { Warning } from "./types.js";
import { checkArtifact } from "./verify.js";

/**
 * Index the caller's `bundled` array by prompt id.
 *
 * Each document is checked against its own content address — check 1 of `readArtifact`'s two. There
 * is no marker to check it against, and there cannot be: nothing newer exists on this machine.
 */
export function indexBundled(documents: unknown, warn: (warning: Warning) => void): ReadonlyMap<string, Entry> {
  const index = new Map<string, Entry>();
  if (documents === undefined || documents === null) return index;
  // An array, not any iterable. A caller who passed a `Map` or a bare object meant something, and
  // guessing at it would be a guess about what is in a customer's prompt. `never-throws.test.ts`
  // found this by passing both.
  if (!Array.isArray(documents)) {
    warn({ code: "malformed", message: "bundled must be an array of build documents; it was ignored" });
    return index;
  }

  let position = 0;
  for (const document of documents) {
    const read = checkArtifact(document);
    position += 1;
    if (!read.ok) {
      warn({
        ...read.warning,
        message: `bundled build ${position} was dropped: ${read.warning.message}`,
      });
      continue;
    }
    index.set(read.value.promptId, { artifact: read.value, version: null, publishedAt: null, etag: null });
  }
  return index;
}
