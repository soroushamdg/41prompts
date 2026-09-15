"use server";

import { inputSetProblems, parseCsv } from "@41prompts/core";
import {
  addBlok,
  addInputSet,
  createSuiteRun,
  DEFAULT_RUN_MODEL,
  inputSetForPrompt,
  promptForOwner,
  removeInputSet,
  RUN_PARAMS,
  setSuiteRunState,
  variablesForPrompt,
} from "@41prompts/db";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { asDeclarations } from "@/lib/variables/queries";
import { compiledNow } from "./queries";
import { enqueueRun } from "./queue";
import { MAX_INPUTS, MAX_UPLOAD_BYTES } from "./limits";
import { columnProblemWords, csvProblemWords } from "./view";

/**
 * Server actions for input sets and runs.
 *
 * Every one follows the canvas's four steps in the same order: **resolve the session, scope by
 * owner, validate, write** — and then `revalidatePath`, every time. EPIC-021a shipped one write
 * without that call and it was the whole of BUG-022 and BUG-021b: two panels learned that a blok
 * existed and never learned what it said. The new e2e suite has no helper that reloads, so a
 * missing call here fails a test instead of hiding behind one.
 */

export interface ActionResult {
  ok: boolean;
  /** Shown to the person. Present only when `ok` is false. */
  message?: string;
}

const REFUSED: ActionResult = {
  ok: false,
  // Deliberately identical for "no such prompt" and "not yours": the two must not be tellable apart.
  message: "That prompt is not available.",
};

async function owned(promptId: string) {
  const session = await requireSession("/app/projects");
  const db = getDb();
  const prompt = await promptForOwner(db, promptId, session.user.id);
  return prompt === undefined ? undefined : { db, prompt, owner: session.user.id };
}

/**
 * Upload a CSV.
 *
 * **Every refusal happens here, and nothing is stored when one does** (decision 1). The three in
 * order of what they cost to discover later: the file is too big to be worth reading; it is not a
 * CSV we can read; its header does not bind this prompt. A file that gets past all three is one
 * that every run over it can bind, which is the property this decision exists to buy.
 */
export async function uploadInputSetAction(promptId: string, form: FormData): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message: `That file is ${Math.round(file.size / 1024)} KB, and the limit is ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB. Nothing was saved.`,
    };
  }

  const parsed = parseCsv(await file.text());
  if (!parsed.ok) return { ok: false, message: csvProblemWords(parsed.problem) };

  if (parsed.rows.length > MAX_INPUTS) {
    return {
      ok: false,
      message: `That file has ${parsed.rows.length} inputs, and the limit is ${MAX_INPUTS}. Nothing was saved.`,
    };
  }

  const declarations = await variablesForPrompt(found.db, promptId);
  const problems = inputSetProblems(parsed.header, asDeclarations(declarations));
  if (problems.length > 0) return { ok: false, message: columnProblemWords(problems) };

  await addInputSet(found.db, promptId, {
    name: file.name === "" ? "inputs.csv" : file.name,
    columns: parsed.header,
    rows: parsed.rows,
  });
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true };
}

/** Remove a set. Soft, because a run in the history ran against it. */
export async function removeInputSetAction(promptId: string, inputSetId: string): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  await removeInputSet(found.db, promptId, inputSetId);
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true };
}

/**
 * Trigger a run.
 *
 * The compiled prompt and its checks are **read once, here, and frozen onto the row**. Everything
 * after this reads the frozen copy: a blok edited while the run is in flight must not change what
 * the later inputs receive, and a failure must not be attributed to a blok that no longer says
 * that.
 *
 * If the queue will not take it, the run is marked refused rather than left `queued`. A row with
 * nothing behind it is a spinner that never ends.
 */
export async function startRunAction(
  promptId: string,
  inputSetId: string
): Promise<ActionResult & { id?: string }> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const { db, owner } = found;

  const set = await inputSetForPrompt(db, promptId, inputSetId);
  if (set === undefined) return { ok: false, message: "That set of inputs is not available." };
  if (set.rowCount === 0) return { ok: false, message: "That set has no inputs in it." };

  const now = await compiledNow(db, promptId, owner);
  if (now === undefined) return REFUSED;

  const checks = now.compiled.checks.map((check) => ({
    checkId: check.id,
    blokId: check.blokId,
    blokKind: now.kindById.get(check.blokId) ?? "expected",
    // Verbatim (rule 3). The check is *about* this text; it is never a paraphrase of it.
    blokText: now.textById.get(check.blokId) ?? check.text,
    ...(check.kind === undefined ? {} : { kind: check.kind }),
  }));

  const suiteRunId = await createSuiteRun(
    db,
    {
      owner,
      prompt: promptId,
      inputSet: inputSetId,
      model: DEFAULT_RUN_MODEL,
      params: RUN_PARAMS as Record<string, unknown>,
      promptHash: contentHash(now.compiled.text),
      promptText: now.compiled.text,
      totalInputs: set.rowCount,
    },
    checks
  );

  try {
    await enqueueRun(suiteRunId);
  } catch {
    await setSuiteRunState(db, suiteRunId, {
      state: "refused",
      // **Not `provider_not_configured`.** Nothing ran, and the reason is ours rather than the
      // person's either way — but this one is the queue refusing the job, which says nothing at all
      // about whether a provider is configured. Naming the wrong one would send somebody to set a
      // key that is already set.
      refusalReason: "queue_unavailable",
      finishedAt: new Date(),
    });
  }

  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true, id: suiteRunId };
}

/**
 * Create a constraint blok from a failure.
 *
 * **It never edits an existing blok** (decision 6), and that is structural rather than a rule this
 * function remembers: `addBlok` is one INSERT and touches no other row, which is the guarantee
 * EPIC-021a decision 5 bought and `packages/db`'s `canvas.test.ts` asserts by checking that no
 * other row's `updatedAt` moves.
 *
 * The text is whatever the preview showed — which starts as the expected blok's **own words** and
 * is theirs to change before confirming. Nothing here composes a sentence on a person's behalf.
 */
export async function addConstraintFromFailureAction(promptId: string, text: string): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;
  if (text.trim() === "") return { ok: false, message: "A constraint needs some words in it." };

  await addBlok(found.db, promptId, { kind: "constraint", text });
  // Both surfaces: the canvas gains a card, and this page's preview closes.
  revalidatePath(`/app/pr/${promptId}`);
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true };
}

/** The compiled prompt's content hash, the same digest `runs.promptHash` records. */
function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
