"use server";

import { byHandProblems, inputSetProblems, parseCsv, rowsFromGrid } from "@41prompts/core";
import {
  addBlok,
  addInputSet,
  createSuiteRun,
  DEFAULT_MODEL_FOR,
  DEFAULT_RUN_MODEL,
  inputSetForPrompt,
  inputSetsForPrompt,
  newComparisonId,
  PROVIDER_TITLES,
  promptForOwner,
  removeInputSet,
  replaceInputSetRows,
  RUN_PARAMS,
  setSuiteRunState,
  variablesForPrompt,
} from "@41prompts/db";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { captureAccountEvent } from "@/lib/analytics/visitor";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { asDeclarations } from "@/lib/variables/queries";
import { pinVersionForRun } from "@/lib/versions/record";
import { keyedProvidersFor } from "@/lib/providers/queries";
import { compiledNow, editRefusalFor } from "./queries";
import { enqueueRun } from "./queue";
import { GRID_LIMITS, MAX_INPUTS, MAX_UPLOAD_BYTES } from "./limits";
import { byHandProblemWords, columnProblemWords, csvProblemWords } from "./view";

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

/**
 * How a typed set is named when the person leaves the name field alone.
 *
 * Not `inputs.csv`. The upload path takes the file's own name because the person chose it; there is
 * no file here, and borrowing the file path's default would put `.csv` on something that never was
 * one — a small lie that a later export would have to keep.
 */
function defaultSetName(existing: number): string {
  return `Inputs ${existing + 1}`;
}

/**
 * One set's rows, for the editor to open onto (EPIC-032a).
 *
 * **A listing deliberately does not carry them.** `input_sets.rowCount` exists precisely so the page
 * can say "12 inputs" without reading the rows blob for every set on every render — the schema says
 * so where the column is declared. Editing is the one moment the rows are actually needed, so they
 * are fetched then, for one set, rather than carried by every page load that will never edit one.
 */
export async function inputSetRowsAction(
  promptId: string,
  inputSetId: string,
): Promise<ActionResult & { rows?: string[][] }> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const set = await inputSetForPrompt(found.db, promptId, inputSetId);
  if (set === undefined) return REFUSED;
  return { ok: true, rows: set.rows };
}

/**
 * Save a set typed into the product (EPIC-032a).
 *
 * **The same four steps in the same order as every action in this file** — resolve the session,
 * scope by owner, validate, write — and the same property as the upload path: every refusal happens
 * before anything is stored (EPIC-032 decision 1).
 *
 * ## The columns are derived here, on the server
 *
 * They are the prompt's declared variables, read in this action from the database, and **nothing the
 * client sends decides them** (decision 2). A grid cannot therefore produce `unknown_column` or
 * `missing_required` — but `inputSetProblems` is still called, on the derived header, as the control
 * that the two writers cannot diverge. If a future change lets a person name a column, that call is
 * already the thing that refuses it.
 */
export async function addInputSetByHandAction(
  promptId: string,
  input: { name: string; rows: readonly (readonly string[])[] },
): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const declarations = await variablesForPrompt(found.db, promptId);
  const columns = declarations.map((declaration) => declaration.name);

  const problems = inputSetProblems(columns, asDeclarations(declarations));
  if (problems.length > 0) return { ok: false, message: columnProblemWords(problems) };

  const rows = rowsFromGrid(input.rows);
  const gridProblems = byHandProblems(rows, columns, GRID_LIMITS);
  if (gridProblems.length > 0) return { ok: false, message: byHandProblemWords(gridProblems) };

  const existing = await inputSetsForPrompt(found.db, promptId);
  const name = input.name.trim() === "" ? defaultSetName(existing.length) : input.name.trim();

  await addInputSet(found.db, promptId, { name, columns, rows });
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true };
}

/**
 * Change a set that **nothing has run** (EPIC-032a decision 3).
 *
 * ## Why the refusal is here and not only on the surface
 *
 * A `suite_run` freezes its compiled prompt onto its own row and keeps its inputs as a foreign key,
 * and the run detail page reads those rows live (`inputSetForPrompt`). Editing a set that has been
 * run would change what a finished run appears to have run against — no error, no visible symptom,
 * and a pass rate computed from rows that no longer exist.
 *
 * The surface hides the control; **this is the guarantee.** A disabled button is a courtesy to the
 * person using the page, not a property of the system, and the property is what history depends on.
 */
export async function updateInputSetAction(
  promptId: string,
  inputSetId: string,
  input: { name: string; rows: readonly (readonly string[])[] },
): Promise<ActionResult> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const set = await inputSetForPrompt(found.db, promptId, inputSetId);
  if (set === undefined) return REFUSED;

  // The rule, and its reasoning, live in `queries.ts` where a test can reach them. The surface
  // hides the control; this is the guarantee.
  const refusal = await editRefusalFor(found.db, inputSetId);
  if (refusal !== undefined) return { ok: false, message: refusal };

  const declarations = await variablesForPrompt(found.db, promptId);
  const columns = declarations.map((declaration) => declaration.name);

  const rows = rowsFromGrid(input.rows);
  const gridProblems = byHandProblems(rows, columns, GRID_LIMITS);
  if (gridProblems.length > 0) return { ok: false, message: byHandProblemWords(gridProblems) };

  const name = input.name.trim() === "" ? set.name : input.name.trim();
  await replaceInputSetRows(found.db, promptId, inputSetId, { name, rows });
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true };
}

/**
 * Copy a set, so the copy can be edited and the original stays what its runs ran against.
 *
 * The name is derived and **shown before it is saved** is the surface's job; what this guarantees is
 * only that two sets are never distinguishable by their id alone (decision 4).
 */
export async function duplicateInputSetAction(
  promptId: string,
  inputSetId: string,
): Promise<ActionResult & { id?: string }> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const set = await inputSetForPrompt(found.db, promptId, inputSetId);
  if (set === undefined) return REFUSED;

  const created = await addInputSet(found.db, promptId, {
    name: `${set.name} (copy)`,
    // The original's columns, not the prompt's declarations as they are now: a copy that quietly
    // re-shaped itself would not be a copy, and the edit that follows is where a person meets any
    // disagreement with the Variables tab.
    columns: set.columns,
    rows: set.rows,
  });
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true, id: created.id };
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

  /**
   * ── EPIC-040 ──────────────────────────────────────────────────────────────────────────────────
   *
   * **Pin the version before the run is created**, so the run's `version` is set at insert rather
   * than by a follow-up update that could not happen. A pinned version can never change again,
   * which is what makes "what exactly did this run score?" answerable next year.
   *
   * It records first, because a prompt last edited before this epic shipped has no versions at all
   * and would otherwise give its runs a null `version` for ever. The first run after EPIC-040 is
   * therefore the moment such a prompt acquires its history rather than a hole in it.
   *
   * **A failure here does not refuse the run.** `suite_runs.version` is nullable for exactly this
   * reason: bookkeeping about a run must never be the thing that stops one.
   */
  const version = await pinVersionForRun(db, promptId, owner);

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
      ...(version === undefined ? {} : { version: version.id }),
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

  // EPIC-034. The pair `run_started`/`run_passed` has been in the closed event set since EPIC-004
  // and emitted by nothing; this is the first half. Consent, `DNT` and `Sec-GPC` are all honoured
  // inside `captureAccountEvent`, so a person who declined contributes nothing — which is correct,
  // not a gap to work around.
  await captureAccountEvent(owner, "run_started");

  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true, id: suiteRunId };
}

/**
 * Run the same prompt, on the same inputs, at **every provider this person has a key for**.
 *
 * ## One run per provider, sharing a `comparison`
 *
 * EPIC-041 added `suite_runs.comparison` for an A/B of two versions: a shared id with no attributes
 * of its own, because two runs made together *are* the whole relationship. A set of runs made
 * together at different providers is the same shape, so it is the same column — and the matrix is a
 * read over it rather than a table nobody else would use.
 *
 * ## "Every provider" means every provider **they** have a key for
 *
 * Not every provider a run could reach. `providerForRun` also falls back to the deployment's own
 * keys, and widening this to those would run somebody's prompt three times on our money because
 * they pressed a button labelled with their own keys. `keyedProvidersFor` is the narrower question.
 *
 * ## The version is pinned once, and every run points at it
 *
 * The comparison is only meaningful if the thing being compared is one thing. Pinning per run would
 * let an edit between the first and third INSERT give two of them different prompts, and the matrix
 * would then be comparing providers *and* versions while claiming to compare providers.
 */
export async function startRunOnEveryProviderAction(
  promptId: string,
  inputSetId: string,
): Promise<ActionResult & { ids?: string[] }> {
  const found = await owned(promptId);
  if (found === undefined) return REFUSED;

  const { db, owner } = found;

  const providers = await keyedProvidersFor(db, owner);
  if (providers.length === 0) {
    return {
      ok: false,
      message:
        "You have not stored a key for any provider yet, so there is nothing to compare. Settings → Providers is where a key goes.",
    };
  }
  if (providers.length === 1) {
    return {
      ok: false,
      message: `You have a key at ${PROVIDER_TITLES[providers[0]!]} and nowhere else, so this would be one run. Use Run instead, or add a second key in Settings → Providers.`,
    };
  }

  const set = await inputSetForPrompt(db, promptId, inputSetId);
  if (set === undefined) return { ok: false, message: "That set of inputs is not available." };
  if (set.rowCount === 0) return { ok: false, message: "That set has no inputs in it." };

  const now = await compiledNow(db, promptId, owner);
  if (now === undefined) return REFUSED;

  const checks = now.compiled.checks.map((check) => ({
    checkId: check.id,
    blokId: check.blokId,
    blokKind: now.kindById.get(check.blokId) ?? "expected",
    blokText: now.textById.get(check.blokId) ?? check.text,
    ...(check.kind === undefined ? {} : { kind: check.kind }),
  }));

  // Once, for the whole comparison. See the note above.
  const version = await pinVersionForRun(db, promptId, owner);
  const comparison = newComparisonId();
  const ids: string[] = [];

  for (const provider of providers) {
    const suiteRunId = await createSuiteRun(
      db,
      {
        owner,
        prompt: promptId,
        inputSet: inputSetId,
        model: DEFAULT_MODEL_FOR[provider],
        params: RUN_PARAMS as Record<string, unknown>,
        promptHash: contentHash(now.compiled.text),
        promptText: now.compiled.text,
        totalInputs: set.rowCount,
        ...(version === undefined ? {} : { version: version.id }),
        comparison,
      },
      checks,
    );
    ids.push(suiteRunId);

    try {
      await enqueueRun(suiteRunId);
    } catch {
      // The other columns are still created and still enqueued: a matrix that says which provider
      // failed to start is more use than no matrix.
      await setSuiteRunState(db, suiteRunId, {
        state: "refused",
        refusalReason: "queue_unavailable",
        finishedAt: new Date(),
      });
    }
  }

  await captureAccountEvent(owner, "run_started");
  revalidatePath(`/app/pr/${promptId}/runs`);
  return { ok: true, ids };
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
