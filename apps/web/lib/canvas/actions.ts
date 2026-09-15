"use server";

import { BLOK_KINDS } from "@41prompts/core";
import {
  addBlok,
  bloksForPrompt,
  deleteBlok,
  moveBlok,
  newProjectId,
  projects,
  promptForOwner,
  prompts,
  restoreBlok,
  setBlokText,
  setHandEdit,
} from "@41prompts/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { slugify } from "./slug";

/**
 * Server actions for the canvas (decision 9 — actions, not a REST API).
 *
 * Every one follows the same four steps in the same order: **resolve the session, scope by owner,
 * validate, write.** The scoping step is a real query, not a check on something the client sent —
 * `promptForOwner` joins through `projects.owner`, so a prompt id belonging to somebody else simply
 * does not resolve and the action refuses without ever disclosing that the id exists.
 *
 * **Blok text is written byte for byte.** No trim, no CRLF conversion, no normalisation, anywhere in
 * this file. `CLAUDE.md` rule 3 says the verbatim span, and EPIC-013 measured what tidying costs.
 * Trailing whitespace in an example is sometimes the point.
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

async function ownedPrompt(promptId: string) {
  const session = await requireSession("/app/projects");
  const db = getDb();
  const prompt = await promptForOwner(db, promptId, session.user.id);
  return prompt === undefined ? undefined : { db, prompt, owner: session.user.id };
}

export async function createProjectAction(name: string): Promise<ActionResult & { id?: string }> {
  const session = await requireSession("/app/projects");
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, message: "Give the project a name." };

  const db = getDb();
  const id = newProjectId();
  // The slug carries the id so two projects of the same name never collide on the unique index.
  await db.insert(projects).values({ id, owner: session.user.id, name: trimmed, slug: `${slugify(trimmed)}-${id}` });
  revalidatePath("/app/projects");
  return { ok: true, id };
}

export async function createPromptAction(projectId: string, name: string): Promise<ActionResult & { id?: string }> {
  const session = await requireSession("/app/projects");
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, message: "Give the prompt a name." };

  const db = getDb();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.owner, session.user.id)))
    .limit(1);
  if (project === undefined) return REFUSED;

  const [row] = await db.insert(prompts).values({ project: projectId, name: trimmed }).returning({ id: prompts.id });
  revalidatePath(`/app/p/${projectId}`);
  return { ok: true, id: row!.id };
}

/**
 * Add a blok.
 *
 * **This is the write decision 5 is about.** It is one INSERT and it touches no other row, so it
 * cannot reach another blok's hand edit — the guarantee is in the shape of the write, not in a rule
 * this function has to remember. `packages/db`'s `canvas.test.ts` asserts exactly that, by checking
 * no other row's `updatedAt` moves.
 */
export async function addBlokAction(
  promptId: string,
  kind: string,
  text: string,
  between?: { before: string | null; after: string | null }
): Promise<ActionResult & { id?: string }> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;
  if (!(BLOK_KINDS as readonly string[]).includes(kind)) return { ok: false, message: "Unknown blok kind." };

  const row = await addBlok(owned.db, promptId, { kind, text }, between);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true, id: row.id };
}

/**
 * Autosave (decision 4).
 *
 * Returns a result rather than throwing or redirecting, because the caller's job on failure is to
 * **leave the typed text exactly where it is** and say so. Nothing here ever sends text back for the
 * field to adopt: a server value written into a field somebody is still typing in is how autosave
 * eats a sentence.
 *
 * ## Why this revalidates, when it deliberately did not
 *
 * This was the only write in this file without a `revalidatePath`, and that asymmetry was
 * **BUG-022 and BUG-021b-compiled-pane-stale, which are one bug**: `addBlokAction` revalidated, so
 * the compiled pane and the Variables tab learned that a blok *existed*; nothing revalidated when
 * its text was saved, so they never learned what it *said*. A span rendered empty and stayed empty,
 * and the Variables tab told people to write `{{a_name}}` in a blok immediately after they had.
 * `apps/web/app/app/pr/[promptId]/page.tsx` computes both panels on the server from these rows, so
 * a server render is the only thing that moves them.
 *
 * **It does not break the promise above, and the reason is structural rather than a resolution to be
 * careful.** `BlokEditor` seeds its field with `useState(initialText)`, which React reads on the
 * first render and never again, and the canvas keys its list on `blok.id`, which does not change, so
 * the component is never remounted by a re-render. A new `initialText` arriving as a prop therefore
 * cannot reach the textarea. The server is still told what the text is and still never tells the
 * field.
 *
 * The cost is one server render per typing pause — `DEBOUNCE_MS` is 600ms, so it is per pause and
 * not per keystroke, which is what every other action in this file already costs.
 */
export async function saveBlokTextAction(promptId: string, blokId: string, text: string): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await setBlokText(owned.db, promptId, blokId, text);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/** Move one blok between two others. One row, unless the ranks had grown and a rebalance was due. */
export async function moveBlokAction(
  promptId: string,
  blokId: string,
  between: { before: string | null; after: string | null }
): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await moveBlok(owned.db, promptId, blokId, between);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/** Soft delete (decision 8). Undoable, because a blok is someone's writing. */
export async function deleteBlokAction(promptId: string, blokId: string): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await deleteBlok(owned.db, promptId, blokId);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/** Undo. Restores text, rank and hand edit together, because the rank was never touched. */
export async function undoDeleteBlokAction(promptId: string, blokId: string): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await restoreBlok(owned.db, promptId, blokId);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/**
 * Take one span by hand (EPIC-021b decision 1).
 *
 * The text is stored **verbatim** — no trim, no normalisation — like every other blok write, and the
 * span is marked edited by hand **at the moment of the edit**, not afterwards, because a pane that
 * tells you later has already let you believe the compiler still owns it.
 *
 * `fromHash` is the blok's hash as the pane was showing it. Keeping it is the entire mechanism
 * behind "the blok has changed since you edited this" — recomputing it here would answer that
 * question "no" for ever.
 */
export async function editSpanAction(
  promptId: string,
  blokId: string,
  text: string,
  fromHash: string
): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await setHandEdit(owned.db, promptId, blokId, { text, fromHash });
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/**
 * Update from blok: give the span back to the compiler (decision 5).
 *
 * **Per span, never global.** There is no bulk version and there must not be, because each one
 * discards something a person wrote and each is therefore a separate decision.
 *
 * Clearing the pair is all it takes: with no hand edit on the row, the blok's text is what compiles,
 * which is what EPIC-021a's placement bought.
 */
export async function updateFromBlokAction(promptId: string, blokId: string): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await setHandEdit(owned.db, promptId, blokId, null);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/**
 * Undo an update from blok (decision 7), by putting back exactly what was there.
 *
 * The same shape as EPIC-021a's delete undo and for the same reason: it destroys writing. The pane
 * holds what it had — including the retained hash — and hands both back, so the restored span is
 * indistinguishable from the one that was replaced rather than approximately it.
 */
export async function undoUpdateFromBlokAction(
  promptId: string,
  blokId: string,
  previous: { text: string; fromHash: string }
): Promise<ActionResult> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return REFUSED;

  await setHandEdit(owned.db, promptId, blokId, previous);
  revalidatePath(`/app/pr/${promptId}`);
  return { ok: true };
}

/** The ranks around a position, so the client can ask for "between these two" without guessing. */
export async function neighbourRanksAction(
  promptId: string,
  index: number
): Promise<{ before: string | null; after: string | null } | undefined> {
  const owned = await ownedPrompt(promptId);
  if (owned === undefined) return undefined;
  const rows = await bloksForPrompt(owned.db, promptId);
  return { before: rows[index - 1]?.rank ?? null, after: rows[index]?.rank ?? null };
}
