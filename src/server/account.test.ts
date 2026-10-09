import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { modelConnections, prompts, promptVersions, session, user } from "@/db/schema";
import { makeUser, testDb } from "@/test/db";
import { deleteAccount, exportPage } from "./account";
import { createConnection } from "./connections";
import { createPrompt, softDelete } from "./prompts";
import { saveVersion } from "./versions";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  process.env.KEYS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ db, close } = await testDb());
});
afterAll(() => close());

describe("export and delete", () => {
  it("pages every live prompt with every version, newest first", async () => {
    const u = await makeUser(db);
    const a = await createPrompt(db, u, { name: "a", bloks: [{ id: "B1", type: "context", text: "one" }], note: "Created from paste" });
    await saveVersion(db, u, a.id, { bloks: [{ id: "B1", type: "context", text: "two" }], baseVersion: 1, clientSaveId: "save_export_1" });
    const gone = await createPrompt(db, u, { name: "gone", bloks: [], note: "Started blank" });
    await softDelete(db, u, gone.id);
    const page = await exportPage(db, u, 0);
    expect(page.total).toBe(1);
    expect(page.versions).toBe(2);
    expect(page.prompts[0]!.versions.map((v) => v.number)).toEqual([2, 1]);
  });

  it("deletes the account and everything in it", async () => {
    const u = await makeUser(db);
    await createPrompt(db, u, { name: "x", bloks: [{ id: "B1", type: "context", text: "x" }], note: "n" });
    await createConnection(db, u, { label: "Work", provider: "openai", runsIn: "server", modelId: "gpt-6.1-sol", settings: {}, secret: { apiKey: "sk-proj-delete-me-0000" }, price: { input: 2, output: 10, source: "catalog" } });
    await db.insert(session).values({ id: `s_${u}`, token: `t_${u}`, userId: u, expiresAt: new Date(Date.now() + 1e6) });
    expect(await deleteAccount(db, u)).toEqual({ prompts: 1, versions: 1, models: 1 });
    expect(await db.select().from(user).where(eq(user.id, u))).toEqual([]);
    expect(await db.select().from(prompts).where(eq(prompts.userId, u))).toEqual([]);
    expect(await db.select().from(modelConnections).where(eq(modelConnections.userId, u))).toEqual([]);
    expect(await db.select().from(session).where(eq(session.userId, u))).toEqual([]);
    const orphans = await db.select().from(promptVersions);
    expect(orphans.every((v) => v.promptId)).toBe(true);
  });
});
