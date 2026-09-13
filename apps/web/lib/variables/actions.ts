"use server";

import { isVariableName, renameVariable, type KeptSpan, type PromptBlok } from "@41prompts/core";
import {
  applyRename,
  bloksForPrompt,
  declareVariable,
  promptForOwner,
  setVariableDetails,
  undeclareVariable,
  variablesForPrompt,
} from "@41prompts/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { asDeclarations } from "./queries";

/**
 * Server actions for the Variables tab. Same four steps as the canvas actions, same order:
 * **resolve the session, scope by owner, validate, write.**
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const REFUSED: ActionResult = { ok: false, message: "That prompt is not available." };

async function resolve(promptId: string) {
  const session = await requireSession(`/app/pr/${promptId}`);
  const db = getDb();
  const prompt = await promptForOwner(db, promptId, session.user.id);
  return prompt === undefined ? undefined : { db, prompt };
}

export async function declare(
  promptId: string,
  name: string,
  defaultValue: string | null,
  description: string | null
): Promise<ActionResult> {
  const scope = await resolve(promptId);
  if (scope === undefined) return REFUSED;
  if (!isVariableName(name)) {
    return { ok: false, message: "A name starts with a letter or underscore and holds no spaces." };
  }

  const outcome = await declareVariable(scope.db, promptId, { name, defaultValue, description });
  if (outcome === "exists") return { ok: false, message: `${name} is already declared.` };

  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

export async function setDetails(
  promptId: string,
  variableId: string,
  defaultValue: string | null,
  description: string | null
): Promise<ActionResult> {
  const scope = await resolve(promptId);
  if (scope === undefined) return REFUSED;

  await setVariableDetails(scope.db, promptId, variableId, { defaultValue, description });
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

export async function undeclare(promptId: string, variableId: string): Promise<ActionResult> {
  const scope = await resolve(promptId);
  if (scope === undefined) return REFUSED;

  await undeclareVariable(scope.db, promptId, variableId);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/**
 * Rename one variable everywhere, **in one transaction or not at all**.
 *
 * The decision about *what* to write is `renameVariable`'s, in `packages/core`, where it is pure and
 * where its test was written before it existed. This function's only job is that the writes it
 * produces land together: a prompt with half its occurrences renamed still compiles and still looks
 * plausible, which is why a partial failure here would be silent.
 *
 * The refusals come back as sentences rather than codes because they are all things the person can
 * act on — pick another name, or refresh and try again.
 */
export async function rename(promptId: string, from: string, to: string): Promise<ActionResult> {
  const scope = await resolve(promptId);
  if (scope === undefined) return REFUSED;

  const rows = await bloksForPrompt(scope.db, promptId);
  const declarations = await variablesForPrompt(scope.db, promptId);

  const bloks: PromptBlok[] = rows.map((row, index) => ({
    id: row.id,
    kind: row.kind as PromptBlok["kind"],
    text: row.text,
    order: index,
  }));
  const keep = new Map<string, KeptSpan>();
  for (const row of rows) {
    if (row.editedText !== null && row.editedFromHash !== null) {
      keep.set(row.id, { text: row.editedText, hash: row.editedFromHash });
    }
  }

  const result = renameVariable(bloks, asDeclarations(declarations), from, to, { keep });
  if (!result.ok) {
    const message =
      result.reason === "invalid-name"
        ? "A name starts with a letter or underscore and holds no spaces."
        : result.reason === "target-exists"
          ? `${to} is already in this prompt. Renaming onto it would merge two variables into one.`
          : `${from} is no longer in this prompt. Refresh and try again.`;
    return { ok: false, message };
  }

  const declarationRow = declarations.find((d) => d.name === from);
  const editedTexts = result.editedTexts.flatMap((changed) => {
    const row = rows.find((r) => r.id === changed.id);
    // A hand edit without its hash is not a hand edit the pane can reason about; skip rather than
    // invent one. `compiledForBloks` only builds `keep` when both columns are set, so this is
    // unreachable in practice and is here so that it stays unreachable rather than becoming a throw.
    return row?.editedFromHash == null ? [] : [{ ...changed, fromHash: row.editedFromHash }];
  });

  await applyRename(scope.db, promptId, {
    blokTexts: result.blokTexts,
    editedTexts,
    declarationId: declarationRow?.id ?? null,
    name: to,
  });

  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}
