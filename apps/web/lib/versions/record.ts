import { snapshot, type HandEdit } from "@41prompts/core";
import { recordVersion, pinVersion, type RecordOutcome, type VersionRow } from "@41prompts/db";
import type { Db } from "@41prompts/db";
import { canvasForOwner } from "@/lib/canvas/queries";

/**
 * Where the canvas meets versions (EPIC-040).
 *
 * Every mutating canvas action ends here. The three rules that decide whether anything is written
 * live in `packages/db/src/versions.ts`; this module's only job is to hand them a snapshot that
 * describes the prompt as it now stands, built the same way the run path builds what it sends.
 *
 * ## Why it never throws, and never blocks the edit
 *
 * A person's blok text is already saved by the time this runs. If versioning fails — a lock, a
 * migration mid-flight, anything — the right outcome is a missing history entry, not a save that
 * reports failure and makes somebody retype a paragraph. The write they care about has already
 * happened; this one is bookkeeping about it.
 *
 * That is a deliberate asymmetry and it is worth stating, because the opposite instinct is strong:
 * a version that silently did not get written is a gap in a history, and a save that falsely
 * reported failure is a person losing work. Only one of those is recoverable by looking at the
 * screen.
 */

/** Build the snapshot for a prompt as it stands, or `undefined` if it does not resolve for this owner. */
async function snapshotNow(
  db: Db,
  promptId: string,
  owner: string,
): Promise<{ snapshot: unknown; compiledText: string } | undefined> {
  const found = await canvasForOwner(db, promptId, owner);
  if (found === undefined) return undefined;

  const handEdits = new Map<string, HandEdit>();
  for (const row of found.bloks) {
    if (row.editedText !== null && row.editedFromHash !== null) {
      handEdits.set(row.id, { editedText: row.editedText, editedFromHash: row.editedFromHash });
    }
  }

  // `order` is the row's position, because rows arrive in rank order already — the same reasoning
  // `compiledForBloks` gives for not deriving a number from the fractional index.
  const frozen = snapshot(
    found.bloks.map((row, index) => ({ id: row.id, kind: row.kind, text: row.text, order: index })),
    handEdits,
  );

  return { snapshot: frozen.bloks, compiledText: frozen.compiledText };
}

/**
 * Record the prompt's current state as a version. Never throws.
 *
 * Returns what `recordVersion` decided, or `undefined` if nothing could be recorded — which a caller
 * should ignore rather than surface. See the module comment.
 */
export async function recordVersionNow(
  db: Db,
  promptId: string,
  owner: string,
): Promise<RecordOutcome | undefined> {
  try {
    const frozen = await snapshotNow(db, promptId, owner);
    if (frozen === undefined) return undefined;
    return await recordVersion(db, promptId, frozen);
  } catch {
    return undefined;
  }
}

/**
 * Pin the version a run is about to execute, minting one first if the prompt has none.
 *
 * **A run must always have a version to point at**, which is why this records before it pins: a
 * prompt whose bloks were last touched before EPIC-040 shipped has no rows in `prompt_versions`, and
 * `suite_runs.version` would be null for a run nobody could later reproduce. Recording first makes
 * the first run after this epic the moment that prompt acquires its history, rather than a hole in
 * it.
 *
 * Unlike `recordVersionNow` this one is allowed to return `undefined` on failure and let the run
 * proceed without a version — `suite_runs.version` is nullable precisely so that a run is never
 * refused over bookkeeping.
 */
export async function pinVersionForRun(
  db: Db,
  promptId: string,
  owner: string,
): Promise<VersionRow | undefined> {
  try {
    await recordVersionNow(db, promptId, owner);
    return await pinVersion(db, promptId);
  } catch {
    return undefined;
  }
}
