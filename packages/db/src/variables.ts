import { and, asc, eq } from "drizzle-orm";
import type { Db } from "./client";
import { bloks, promptVariables } from "./schema";

/**
 * Owner-scoped reads and writes for a prompt's declared variables.
 *
 * Same rule as `canvas.ts`: **the caller has already resolved the prompt for this owner** through
 * `promptForOwner`, and every function here is scoped by `promptId` so a variable is reachable only
 * through a prompt that resolved. Nothing here takes a bare variable id without its prompt.
 */

export interface VariableRow {
  id: string;
  name: string;
  defaultValue: string | null;
  description: string | null;
}

/** This prompt's declarations, in name order — the order the Variables tab shows them in. */
export async function variablesForPrompt(db: Db, promptId: string): Promise<VariableRow[]> {
  return db
    .select({
      id: promptVariables.id,
      name: promptVariables.name,
      defaultValue: promptVariables.defaultValue,
      description: promptVariables.description,
    })
    .from(promptVariables)
    .where(eq(promptVariables.prompt, promptId))
    .orderBy(asc(promptVariables.name));
}

/**
 * Declare a variable. Returns `"exists"` rather than throwing when the name is already declared,
 * because "you already have one of those" is an answer the surface shows, not an error it handles.
 */
export async function declareVariable(
  db: Db,
  promptId: string,
  variable: { name: string; defaultValue: string | null; description: string | null }
): Promise<"declared" | "exists"> {
  const inserted = await db
    .insert(promptVariables)
    .values({ prompt: promptId, ...variable })
    .onConflictDoNothing({ target: [promptVariables.prompt, promptVariables.name] })
    .returning({ id: promptVariables.id });
  return inserted.length > 0 ? "declared" : "exists";
}

/** Edit the two fields a declaration has beyond its name. A rename goes through `renameDeclaration`. */
export async function setVariableDetails(
  db: Db,
  promptId: string,
  variableId: string,
  details: { defaultValue: string | null; description: string | null }
): Promise<void> {
  await db
    .update(promptVariables)
    .set({ ...details, updatedAt: new Date() })
    .where(and(eq(promptVariables.id, variableId), eq(promptVariables.prompt, promptId)));
}

/**
 * Apply a rename: every blok text, every hand-edited span, and the declaration row, **in one
 * transaction or none of them**.
 *
 * ## Why the transaction is here and not in the server action
 *
 * A prompt with half its occurrences renamed still compiles and still reads plausibly, so a partial
 * failure is silent — the worst shape a failure can have. Keeping the whole write in one function
 * means there is exactly one place where that can go wrong, and it is this one. It also keeps
 * Drizzle out of `apps/web`, which is what `lib/canvas/queries.ts` says the thin layer is for.
 *
 * **What to write is not decided here.** `renameVariable` in `@41prompts/core` is pure, was written
 * after its test, and produced these texts. This function does not look at `{{` at all.
 *
 * `fromHash` travels unchanged on a hand edit. A rename is not a new hand edit, and recomputing the
 * hash would quietly answer "no" to "has the blok changed since you edited this" for ever.
 */
export async function applyRename(
  db: Db,
  promptId: string,
  change: {
    blokTexts: readonly { id: string; text: string }[];
    editedTexts: readonly { id: string; text: string; fromHash: string }[];
    declarationId: string | null;
    name: string;
  }
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();

    for (const blok of change.blokTexts) {
      await tx
        .update(bloks)
        .set({ text: blok.text, updatedAt: now })
        .where(and(eq(bloks.id, blok.id), eq(bloks.prompt, promptId)));
    }

    for (const edit of change.editedTexts) {
      await tx
        .update(bloks)
        .set({ editedText: edit.text, editedFromHash: edit.fromHash, updatedAt: now })
        .where(and(eq(bloks.id, edit.id), eq(bloks.prompt, promptId)));
    }

    if (change.declarationId !== null) {
      await tx
        .update(promptVariables)
        .set({ name: change.name, updatedAt: now })
        .where(and(eq(promptVariables.id, change.declarationId), eq(promptVariables.prompt, promptId)));
    }
  });
}

/**
 * Remove a declaration.
 *
 * A hard delete, unlike a blok's. A blok is someone's writing and its delete is a column with an
 * undo (EPIC-021a decision 8); a declaration is three fields of metadata about a name that still
 * exists in the text, and undeclaring it loses nothing that the prompt does not still say.
 */
export async function undeclareVariable(db: Db, promptId: string, variableId: string): Promise<void> {
  await db
    .delete(promptVariables)
    .where(and(eq(promptVariables.id, variableId), eq(promptVariables.prompt, promptId)));
}
