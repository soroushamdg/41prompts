import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { prompts, promptVersions } from "@/db/schema";
import type { Blok } from "@/lib/bloks";
import { makeUser, testDb } from "@/test/db";
import { createPrompt, duplicatePrompt, getPromptBySlug, listPrompts, purgeDeleted, renamePrompt, setArchived, SlugTaken, softDelete, undoDelete, versionCounts } from "./prompts";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await testDb()));
afterAll(() => close());

const paste: Blok[] = [{ id: "B1", type: "context", text: "You are the order assistant for {{shop}}.\n\nKeep replies short." }];

describe("prompts", () => {
  it("creates a prompt with v1, a sheet number and a description", async () => {
    const u = await makeUser(db);
    const a = await createPrompt(db, u, { name: "Order Status Reply", bloks: paste, note: "Created from paste" });
    const b = await createPrompt(db, u, { name: "order-status-reply", bloks: paste, note: "Created from paste" });
    expect(a.slug).toBe("order-status-reply");
    expect(b.slug).toBe("order-status-reply-2");
    expect([a.sheetNumber, b.sheetNumber]).toEqual([1, 2]);
    expect(a.description).toBe("You are the order assistant for {{shop}}.");
    const [v] = await db.select().from(promptVersions).where(eq(promptVersions.promptId, a.id));
    expect(v).toMatchObject({ number: 1, note: "Created from paste", bloks: paste });
    const [row] = await db.select().from(prompts).where(eq(prompts.id, a.id));
    expect(row?.nextBlokId).toBe(2);
  });

  it("keeps every user's library private", async () => {
    const u1 = await makeUser(db);
    const u2 = await makeUser(db);
    const p = await createPrompt(db, u1, { name: "mine", bloks: paste, note: "Created from paste" });
    expect(await listPrompts(db, u2)).toEqual([]);
    await expect(renamePrompt(db, u2, p.id, "stolen")).rejects.toThrow();
    await softDelete(db, u2, p.id);
    expect(await getPromptBySlug(db, u1, "mine")).not.toBeNull();
  });

  it("renames, refusing a name already in use", async () => {
    const u = await makeUser(db);
    const p = await createPrompt(db, u, { name: "alpha", bloks: paste, note: "n" });
    await createPrompt(db, u, { name: "beta", bloks: paste, note: "n" });
    expect(await renamePrompt(db, u, p.id, "Alpha Two")).toBe("alpha-two");
    await expect(renamePrompt(db, u, p.id, "beta")).rejects.toBeInstanceOf(SlugTaken);
  });

  it("duplicates the head version as name-copy", async () => {
    const u = await makeUser(db);
    const p = await createPrompt(db, u, { name: "support-reply", bloks: paste, note: "n" });
    const c1 = await duplicatePrompt(db, u, p.id);
    const c2 = await duplicatePrompt(db, u, p.id);
    expect([c1.slug, c2.slug]).toEqual(["support-reply-copy", "support-reply-copy-2"]);
    const [v] = await db.select().from(promptVersions).where(eq(promptVersions.promptId, c1.id));
    expect(v?.note).toBe("Duplicated from support-reply v1");
  });

  it("archives, deletes with undo, and purges", async () => {
    const u = await makeUser(db);
    const p = await createPrompt(db, u, { name: "gone", bloks: paste, note: "n" });
    await setArchived(db, u, p.id, true);
    expect((await listPrompts(db, u))[0]?.archived).toBe(true);
    await softDelete(db, u, p.id);
    expect(await listPrompts(db, u)).toEqual([]);
    const taker = await createPrompt(db, u, { name: "gone", bloks: paste, note: "n" });
    expect(taker.slug).toBe("gone");
    const back = await undoDelete(db, u, p.id);
    expect(back?.slug).toBe("gone-2");
    await softDelete(db, u, p.id);
    expect(await purgeDeleted(db, new Date(Date.now() - 60_000))).toBe(0);
    expect(await purgeDeleted(db, new Date(Date.now() + 1000))).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(promptVersions).where(eq(promptVersions.promptId, p.id))).toEqual([]);
    expect(await versionCounts(db, u)).toEqual({ prompts: 1, versions: 1 });
  });
});
