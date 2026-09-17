"use server";

import { readSnapshotBloks } from "@41prompts/core";
import {
  applySnapshot,
  BlokBelongsElsewhereError,
  createSuiteRun,
  DEFAULT_RUN_MODEL,
  inputSetForPrompt,
  newComparisonId,
  pinVersion,
  promptForOwner,
  RUN_PARAMS,
  setSuiteRunState,
  setVersionNote,
  VERSION_NOTE_MAX,
  type VersionRow,
} from "@41prompts/db";
import { revalidatePath } from "next/cache";
import { captureAccountEvent } from "@/lib/analytics/visitor";
import { getDb } from "@/lib/db";
import { enqueueRun } from "@/lib/runs/queue";
import { requireSession } from "@/lib/session";
import { compileVersion } from "./compile";
import { recordVersionNow } from "./record";
import { versionForOwner } from "./queries";

/**
 * Server actions for the Versions page: restore, A/B, and a note.
 *
 * The same four steps in the same order as every other action module here — **resolve the session,
 * scope by owner, validate, write** — and then `revalidatePath`, every time. A missing revalidate is
 * the whole of BUG-022 and BUG-021b, and nothing in the e2e suite reloads, so a missing one fails a
 * test rather than hiding behind one.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const REFUSED: ActionResult = {
  ok: false,
  // Identical for "no such prompt" and "not yours": the two must not be tellable apart.
  message: "That prompt is not available.",
};

async function owned(promptId: string) {
  const session = await requireSession("/app/projects");
  const db = getDb();
  const prompt = await promptForOwner(db, promptId, session.user.id);
  return prompt === undefined ? undefined : { db, prompt, owner: session.user.id };
}

function revalidate(promptId: string): void {
  revalidatePath(`/app/pr/${promptId}`);
  revalidatePath(`/app/pr/${promptId}/versions`);
  revalidatePath(`/app/pr/${promptId}/runs`);
}

/**
 * Put an older version's blok set back on the canvas.
 *
 * ## The order is the epic, and the roadmap's Review line is why
 *
 * *"Restore never deletes."* Read only as "does not delete a version row", that is free — nothing
 * here ever deleted one. It has to mean more, because there **is** something a naive restore
 * destroys: the open `Draft vN`. It is unpinned, so rule 2 rewrites it in place, and the work that
 * was in it — everything typed since the last run — would have no other home. A person restoring
 * "just to look" would silently lose an afternoon.
 *
 * So the order is:
 *
 * 1. **record** — the open draft catches up with whatever is on the canvas right now;
 * 2. **pin** — it is frozen, so it survives as its own version and can be restored back to;
 * 3. **apply** — the canvas becomes the older blok set;
 * 4. **record** — which now mints `Draft v(N+1)`, because step 2 pinned the one before it.
 *
 * The history gains rows and loses none, in every case. That is the sentence in three words.
 *
 * ## It reports failure, unlike `recordVersionNow`
 *
 * Recording a version is bookkeeping about a write that already happened, so it swallows errors
 * rather than making somebody retype a paragraph. A restore **is** the write. A restore that half
 * happened and said nothing would leave a canvas in a state the person never had, which is precisely
 * what they pressed the button to avoid.
 */
export async function restoreVersionAction(promptId: string, versionId: string): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const version = await versionForOwner(found.db, promptId, versionId, found.owner);
  if (version === undefined) return { ok: false, message: "That version is not in this prompt's history." };

  const bloks = readSnapshotBloks(version.snapshot);
  if (bloks === undefined) {
    return { ok: false, message: "That version's blok set cannot be read, so nothing was changed." };
  }

  try {
    // 1 and 2 — see above. Both before anything on the canvas moves.
    await recordVersionNow(found.db, promptId, found.owner);
    await pinVersion(found.db, promptId);

    await applySnapshot(found.db, promptId, bloks);

    // 4. Mints, because step 2 pinned the row this would otherwise have rewritten.
    await recordVersionNow(found.db, promptId, found.owner);
  } catch (error) {
    if (error instanceof BlokBelongsElsewhereError) {
      return {
        ok: false,
        message: "That version names a blok that belongs to another prompt, so nothing was changed.",
      };
    }
    throw error;
  }

  revalidate(promptId);
  return { ok: true };
}

/**
 * Run two versions against one input set, as two runs that know about each other.
 *
 * ## Each run sends its version's own frozen text
 *
 * `promptText` is `version.compiledText` and `promptHash` is `version.compiledHash` — **not** a
 * recompile of the snapshot. A version's compiled text is the historical fact; recompiling it under
 * whatever `COMPILER_VERSION` is current would make "run Draft v3" mean something other than what
 * Draft v3 was, which is the one thing a version exists to prevent.
 *
 * The snapshot supplies the **checks**, because a check is derived from an expected blok's text and
 * that text is in the snapshot verbatim. `compile()`'s `.text` is discarded here on purpose; only
 * `.checks` is used.
 *
 * ## Both versions are pinned first
 *
 * A version something points at may never change again, and an A/B points at both. Only the newest
 * version of a prompt can be unpinned — rule 3 mints a new row once the newest is pinned — so a
 * single `pinVersion` call covers whichever of the pair is the open draft, if either is.
 *
 * ## One `run_started`, not two
 *
 * Two runs are created and one person pressed one button. The activation funnel counts the act, and
 * firing twice for one act would make an A/B look like two separate sessions of work.
 */
export async function abAction(
  promptId: string,
  aVersionId: string,
  bVersionId: string,
  inputSetId: string,
): Promise<ActionResult & { runIds?: [string, string] }> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;
  const { db, owner } = found;

  if (aVersionId === bVersionId) {
    return { ok: false, message: "Pick two different versions to compare." };
  }

  const set = await inputSetForPrompt(db, promptId, inputSetId);
  if (set === undefined) return { ok: false, message: "That set of inputs is not available." };
  if (set.rowCount === 0) return { ok: false, message: "That set has no inputs in it." };

  let a = await versionForOwner(db, promptId, aVersionId, owner);
  let b = await versionForOwner(db, promptId, bVersionId, owner);
  if (a === undefined || b === undefined) {
    return { ok: false, message: "One of those versions is not in this prompt's history." };
  }

  if (a.pinnedAt === null || b.pinnedAt === null) {
    await pinVersion(db, promptId);
    // Re-read so the rows carry the pin. Not strictly needed to create the runs, but a stale
    // `pinnedAt` in memory is the kind of thing a later edit here would quietly depend on.
    a = (await versionForOwner(db, promptId, aVersionId, owner)) ?? a;
    b = (await versionForOwner(db, promptId, bVersionId, owner)) ?? b;
  }

  const comparison = newComparisonId();
  const runIds: string[] = [];

  for (const version of [a, b]) {
    const checks = checksOf(version);
    if (checks === undefined) {
      return { ok: false, message: `Draft v${version.n}'s blok set cannot be read, so nothing was run.` };
    }

    const suiteRunId = await createSuiteRun(
      db,
      {
        owner,
        prompt: promptId,
        inputSet: inputSetId,
        model: DEFAULT_RUN_MODEL,
        params: RUN_PARAMS as Record<string, unknown>,
        // The version's own frozen text and hash — see above.
        promptHash: version.compiledHash,
        promptText: version.compiledText,
        totalInputs: set.rowCount,
        version: version.id,
        comparison,
      },
      checks,
    );
    runIds.push(suiteRunId);

    try {
      await enqueueRun(suiteRunId);
    } catch {
      // A row left `queued` with nothing behind it is a spinner that never ends. The other half of
      // the comparison is still created and still enqueued: half an A/B that says which half failed
      // is more use than neither.
      await setSuiteRunState(db, suiteRunId, {
        state: "refused",
        refusalReason: "queue_unavailable",
        finishedAt: new Date(),
      });
    }
  }

  await captureAccountEvent(owner, "run_started");
  revalidate(promptId);
  return { ok: true, runIds: [runIds[0]!, runIds[1]!] };
}

/**
 * The checks a version's blok set compiles to, frozen onto a run the same way `startRunAction`
 * freezes the live ones.
 *
 * `undefined` when the snapshot cannot be read, which the caller turns into a refusal naming the
 * version rather than running something it guessed at.
 */
function checksOf(
  version: VersionRow,
): { checkId: string; blokId: string; blokKind: string; blokText: string; kind?: string }[] | undefined {
  // Extracted to `./compile` when EPIC-051 needed the same three steps — snapshot to `PromptBlok[]`,
  // hand edits replayed, `compile()` — for the artifact it publishes. Two callers, one answer to
  // "what does this version compile to"; a second copy of it would be a second answer.
  const recompiled = compileVersion(version);
  if (recompiled === undefined) return undefined;

  const snapshotBloks = recompiled.bloks;
  const kindById = new Map(snapshotBloks.map((blok) => [blok.id, blok.kind]));
  const textById = new Map(snapshotBloks.map((blok) => [blok.id, blok.text]));

  return recompiled.compiled.checks.map((check) => ({
    checkId: check.id,
    blokId: check.blokId,
    blokKind: kindById.get(check.blokId) ?? "expected",
    // Verbatim (rule 3). The check is *about* this text; it is never a paraphrase of it.
    blokText: textById.get(check.blokId) ?? check.text,
    ...(check.kind === undefined ? {} : { kind: check.kind }),
  }));
}

/**
 * Write a person's own words about a version.
 *
 * Allowed on a pinned version — `setVersionNote` says why. The one field on `prompt_versions` that
 * is somebody's sentence rather than a frozen fact.
 */
export async function setVersionNoteAction(
  promptId: string,
  versionId: string,
  note: string,
): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  if (note.length > VERSION_NOTE_MAX) {
    return { ok: false, message: `A note is at most ${VERSION_NOTE_MAX} characters. Nothing was saved.` };
  }

  const version = await versionForOwner(found.db, promptId, versionId, found.owner);
  if (version === undefined) return { ok: false, message: "That version is not in this prompt's history." };

  await setVersionNote(found.db, promptId, versionId, note);
  revalidate(promptId);
  return { ok: true };
}
