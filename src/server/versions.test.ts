import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { prompts, promptVersions } from "@/db/schema";
import type { Blok } from "@/lib/bloks";
import { makeUser, testDb } from "@/test/db";
import { createPrompt } from "./prompts";
import { getVersionBloks, listVersions, nameVersion, restoreVersion, SaveSchema, saveFillValues, saveVersion } from "./versions";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await testDb()));
afterAll(() => close());

const v1: Blok[] = [{ id: "B1", type: "context", text: "You are a support agent." }];
let n = 0;
const sid = () => `save_${Date.now()}_${++n}`;

async function setup() {
  const u = await makeUser(db);
  const p = await createPrompt(db, u, { name: "support-reply", bloks: v1, note: "Created from paste" });
  return { u, id: p.id };
}

describe("autosave", () => {
  it("adds one version per save with a derived note", async () => {
    const { u, id } = await setup();
    const r = await saveVersion(db, u, id, { bloks: [...v1, { id: "B2", type: "constraint", text: "Under 80 words." }], baseVersion: 1, clientSaveId: sid() });
    expect(r).toMatchObject({ created: true, conflict: false, version: { number: 2, note: "Added B2" } });
    const [p] = await db.select().from(prompts).where(eq(prompts.id, id));
    expect(p).toMatchObject({ headVersion: 2, bloksCount: 2, nextBlokId: 3 });
  });

  it("creates nothing for a snapshot identical to the head", async () => {
    const { u, id } = await setup();
    const r = await saveVersion(db, u, id, { bloks: v1, baseVersion: 1, clientSaveId: sid() });
    expect(r).toMatchObject({ created: false, version: { number: 1 } });
  });

  it("is idempotent for a retried save", async () => {
    const { u, id } = await setup();
    const save = { bloks: [{ ...v1[0]!, text: "Edited." }], baseVersion: 1, clientSaveId: sid() };
    const a = await saveVersion(db, u, id, save);
    const b = await saveVersion(db, u, id, save);
    expect(a?.version.number).toBe(2);
    expect(b).toMatchObject({ created: false, version: { number: 2 } });
    expect(await listVersions(db, id)).toHaveLength(2);
  });

  it("keeps both sides of a conflict as versions and flags it", async () => {
    const { u, id } = await setup();
    await saveVersion(db, u, id, { bloks: [{ ...v1[0]!, text: "Tab A" }], baseVersion: 1, clientSaveId: sid() });
    const b = await saveVersion(db, u, id, { bloks: [{ ...v1[0]!, text: "Tab B" }], baseVersion: 1, clientSaveId: sid() });
    expect(b).toMatchObject({ created: true, conflict: true, version: { number: 3 } });
  });

  it("serialises concurrent saves without losing or duplicating numbers", async () => {
    const { u, id } = await setup();
    await Promise.all([1, 2, 3, 4].map((i) => saveVersion(db, u, id, { bloks: [{ ...v1[0]!, text: `t${i}` }], baseVersion: 1, clientSaveId: sid() })));
    expect((await listVersions(db, id)).map((v) => v.number)).toEqual([5, 4, 3, 2, 1]);
  });

  it("refuses another user's prompt", async () => {
    const { id } = await setup();
    const other = await makeUser(db);
    expect(await saveVersion(db, other, id, { bloks: v1, baseVersion: 1, clientSaveId: sid() })).toBeNull();
    expect(await getVersionBloks(db, other, id, 1)).toBeNull();
  });

  it("validates payloads", () => {
    expect(SaveSchema.safeParse({ bloks: [{ id: "B1", type: "context", text: "" }, { id: "B1", type: "context", text: "" }], baseVersion: 1, clientSaveId: "abcdefgh" }).success).toBe(false);
    expect(SaveSchema.safeParse({ bloks: [{ id: "X1", type: "context", text: "" }], baseVersion: 1, clientSaveId: "abcdefgh" }).success).toBe(false);
    expect(SaveSchema.safeParse({ bloks: [{ id: "B1", type: "lol", text: "" }], baseVersion: 1, clientSaveId: "abcdefgh" }).success).toBe(false);
    expect(SaveSchema.safeParse({ bloks: [{ id: "B1", type: "context", text: "x".repeat(103_000) }], baseVersion: 1, clientSaveId: "abcdefgh" }).success).toBe(false);
  });
});

describe("history", () => {
  it("restores an old version as a new one, leaving every row in place", async () => {
    const { u, id } = await setup();
    await saveVersion(db, u, id, { bloks: [{ ...v1[0]!, text: "Second" }], baseVersion: 1, clientSaveId: sid() });
    const r = await restoreVersion(db, u, id, 1);
    expect(r).toMatchObject({ version: { number: 3, note: "Restored v1" }, bloks: v1 });
    const rows = await db.select().from(promptVersions).where(eq(promptVersions.promptId, id));
    expect(rows.map((x) => x.bloks[0]!.text).sort()).toEqual(["Second", "You are a support agent.", "You are a support agent."]);
  });

  it("names a version and stores fill values", async () => {
    const { u, id } = await setup();
    expect(await nameVersion(db, u, id, 1, "  works on Claude ")).toBe(true);
    expect((await listVersions(db, id))[0]?.name).toBe("works on Claude");
    await saveFillValues(db, u, id, { customer_name: "Sam", "bad key": "x" });
    const [p] = await db.select().from(prompts).where(eq(prompts.id, id));
    expect(p?.fillValues).toEqual({ customer_name: "Sam" });
  });
});
