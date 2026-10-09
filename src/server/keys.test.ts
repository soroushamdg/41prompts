import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { modelKeys } from "@/db/schema";
import { makeUser, testDb } from "@/test/db";
import { listKeys, readKey, removeKey, saveKey } from "./keys";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  process.env.KEYS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ db, close } = await testDb());
});
afterAll(() => close());

describe("model keys", () => {
  it("stores only ciphertext, lists last four, reads back, replaces, removes", async () => {
    const u = await makeUser(db);
    await saveKey(db, u, "openai", "sk-proj-first-key-3f9a");
    const [row] = await db.select().from(modelKeys).where(eq(modelKeys.userId, u));
    expect(JSON.stringify(row)).not.toContain("first-key");
    expect(await listKeys(db, u)).toMatchObject([{ provider: "openai", last4: "3f9a" }]);
    expect(await readKey(db, u, "openai")).toBe("sk-proj-first-key-3f9a");
    await saveKey(db, u, "openai", "sk-proj-second-key-8c1d");
    expect(await readKey(db, u, "openai")).toBe("sk-proj-second-key-8c1d");
    expect(await readKey(db, u, "google")).toBeNull();
    await removeKey(db, u, "openai");
    expect(await listKeys(db, u)).toEqual([]);
  });

  it("keeps each user's keys to themselves", async () => {
    const a = await makeUser(db);
    const b = await makeUser(db);
    await saveKey(db, a, "anthropic", "sk-ant-aaaa-1111");
    expect(await readKey(db, b, "anthropic")).toBeNull();
  });
});
