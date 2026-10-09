"use server";
import { z } from "zod";
import { db } from "@/db";
import { BLOK_TYPES, MAX_PROMPT_CHARS, type Blok } from "@/lib/bloks";
import { nameFromText } from "@/lib/slug";
import { createPrompt, duplicatePrompt, type LibraryItem, renamePrompt, setArchived, SlugTaken, softDelete, undoDelete } from "@/server/prompts";
import { currentUserId } from "@/server/session";

/* Library and New prompt actions. Each one checks the session itself; the
   proxy's redirect is only a convenience. */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const Id = z.string().uuid();

const CreateInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("paste"), name: z.string().max(200), text: z.string().max(MAX_PROMPT_CHARS) }),
  z.object({ mode: z.literal("blank"), name: z.string().max(200), type: z.enum(BLOK_TYPES) }),
]);

export async function createPromptAction(input: z.infer<typeof CreateInput>): Promise<Result<{ slug: string }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That prompt is too long. The limit is about 100 KB." };
  const v = parsed.data;
  const bloks: Blok[] = v.mode === "paste" ? [{ id: "B1", type: "context", text: v.text }] : [{ id: "B1", type: v.type, text: "" }];
  const name = v.name.trim() || (v.mode === "paste" ? nameFromText(v.text) : "untitled-prompt");
  const item = await createPrompt(db, userId, { name, bloks, note: v.mode === "paste" ? (v.text.trim() ? "Created from paste" : "Started blank") : "Started blank" });
  return { ok: true, slug: item.slug };
}

export async function renamePromptAction(id: string, name: string): Promise<Result<{ slug: string }>> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(id).success) return { ok: false, error: "Not found." };
  try {
    return { ok: true, slug: await renamePrompt(db, userId, id, name) };
  } catch (e) {
    if (e instanceof SlugTaken) return { ok: false, error: `You already have a prompt named ${e.slug}.` };
    return { ok: false, error: "The rename did not save." };
  }
}

export async function duplicatePromptAction(id: string): Promise<Result<{ item: LibraryItem }>> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(id).success) return { ok: false, error: "Not found." };
  return { ok: true, item: await duplicatePrompt(db, userId, id) };
}

export async function archivePromptAction(id: string, archived: boolean): Promise<Result<object>> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(id).success) return { ok: false, error: "Not found." };
  await setArchived(db, userId, id, archived);
  return { ok: true };
}

export async function deletePromptAction(id: string): Promise<Result<object>> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(id).success) return { ok: false, error: "Not found." };
  await softDelete(db, userId, id);
  return { ok: true };
}

export async function undoDeletePromptAction(id: string): Promise<Result<{ item: LibraryItem }>> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(id).success) return { ok: false, error: "Not found." };
  const item = await undoDelete(db, userId, id);
  return item ? { ok: true, item } : { ok: false, error: "It could not be restored." };
}
