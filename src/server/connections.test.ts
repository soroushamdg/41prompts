import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { modelConnections } from "@/db/schema";
import { makeUser, testDb } from "@/test/db";
import { type CreateInput, createConnection, getConnection, listConnections, MAX_CONNECTIONS, readSecret, recordTest, removeConnection, updateConnection } from "./connections";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  process.env.KEYS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ db, close } = await testDb());
});
afterAll(() => close());

const openai = (over: Partial<CreateInput> = {}): CreateInput => ({
  label: "Work GPT",
  provider: "openai",
  runsIn: "server",
  modelId: "gpt-6.1-sol",
  settings: {},
  secret: { apiKey: "sk-proj-first-key-3f9a" },
  price: { input: 2, output: 10, source: "catalog" },
  ...over,
});

describe("model connections", () => {
  it("stores only ciphertext, lists a hint, reads back", async () => {
    const u = await makeUser(db);
    const c = await createConnection(db, u, openai());
    const [row] = await db.select().from(modelConnections).where(eq(modelConnections.id, c.id));
    expect(JSON.stringify(row)).not.toContain("first-key");
    const list = await listConnections(db, u);
    expect(JSON.stringify(list)).not.toContain("first-key");
    expect(list).toMatchObject([{ label: "Work GPT", provider: "openai", modelId: "gpt-6.1-sol", hasSecret: true, secretHint: "3f9a", price: { input: 2, output: 10, source: "catalog" } }]);
    expect(readSecret(u, row!)).toEqual({ apiKey: "sk-proj-first-key-3f9a" });
  });

  it("lets one provider appear many times, but labels are unique per user", async () => {
    const u = await makeUser(db);
    await createConnection(db, u, openai());
    await createConnection(db, u, openai({ label: "Cheap GPT", modelId: "gpt-6-luna" }));
    await expect(createConnection(db, u, openai({ label: "work gpt" }))).rejects.toMatchObject({ reason: "label" });
    const other = await makeUser(db);
    await expect(createConnection(db, other, openai())).resolves.toBeTruthy();
    expect(await listConnections(db, u)).toHaveLength(2);
  });

  it("keeps, replaces, and refuses to move a saved key to a new address", async () => {
    const u = await makeUser(db);
    const c = await createConnection(db, u, openai({ provider: "custom", label: "Gateway", settings: { baseURL: "https://llm.example.com/v1" }, secret: { apiKey: "gw-key-1111" } }));
    const base = { provider: "custom", label: "Gateway", modelId: "m2", runsIn: "server" as const, price: { input: null, output: null, source: null } };
    await updateConnection(db, u, c.id, { ...base, settings: { baseURL: "https://llm.example.com/v2" }, secret: "keep" });
    expect(readSecret(u, (await getConnection(db, u, c.id))!)).toEqual({ apiKey: "gw-key-1111" });
    await expect(updateConnection(db, u, c.id, { ...base, settings: { baseURL: "https://evil.example/v1" }, secret: "keep" })).rejects.toMatchObject({ reason: "rekey" });
    await updateConnection(db, u, c.id, { ...base, settings: { baseURL: "https://other.example/v1" }, secret: { apiKey: "gw-key-2222" } });
    const row = (await getConnection(db, u, c.id))!;
    expect(readSecret(u, row)).toEqual({ apiKey: "gw-key-2222" });
    expect(row.secretHint).toBe("2222");
    await expect(updateConnection(db, u, c.id, { ...base, provider: "openai", settings: {}, secret: "keep" })).rejects.toMatchObject({ reason: "not_found" });
  });

  it("duplicates by re-sealing the key under the new model", async () => {
    const u = await makeUser(db);
    const a = await createConnection(db, u, openai());
    const b = await createConnection(db, u, openai({ label: "Work GPT (copy)", modelId: "gpt-6-astra", secret: { from: a.id } }));
    const [ra, rb] = [(await getConnection(db, u, a.id))!, (await getConnection(db, u, b.id))!];
    expect(rb.ciphertext).not.toBe(ra.ciphertext);
    expect(readSecret(u, rb)).toEqual({ apiKey: "sk-proj-first-key-3f9a" });
    const stranger = await makeUser(db);
    await expect(createConnection(db, stranger, openai({ secret: { from: a.id } }))).rejects.toMatchObject({ reason: "not_found" });
  });

  it("a ciphertext copied to another row or user does not open", async () => {
    const u = await makeUser(db);
    const a = await createConnection(db, u, openai());
    const b = await createConnection(db, u, openai({ label: "Other", secret: { apiKey: "sk-proj-other-0000" } }));
    const ra = (await getConnection(db, u, a.id))!;
    const rb = (await getConnection(db, u, b.id))!;
    expect(() => readSecret(u, { ...rb, ciphertext: ra.ciphertext, iv: ra.iv, authTag: ra.authTag })).toThrow();
    expect(() => readSecret("someone-else", ra)).toThrow();
  });

  it("browser models never hold a secret", async () => {
    const u = await makeUser(db);
    const c = await createConnection(db, u, openai({ provider: "ollama", label: "Llama", runsIn: "browser", settings: { baseURL: "http://localhost:11434/v1" }, secret: { apiKey: "should-not-be-stored" } }));
    const row = (await getConnection(db, u, c.id))!;
    expect(row.ciphertext).toBeNull();
    expect(c.hasSecret).toBe(false);
    await expect(db.update(modelConnections).set({ ciphertext: "x", iv: "x", authTag: "x", keyVersion: 1 }).where(eq(modelConnections.id, c.id))).rejects.toThrow();
  });

  it("records tests, removes only the owner's models, and caps the list", async () => {
    const u = await makeUser(db);
    const c = await createConnection(db, u, openai());
    await recordTest(db, u, c.id, { ok: true, ms: 212, message: null });
    expect((await listConnections(db, u))[0]!.lastTest).toMatchObject({ ok: true, ms: 212 });
    const stranger = await makeUser(db);
    expect(await removeConnection(db, stranger, c.id)).toBe(false);
    expect(await removeConnection(db, u, c.id)).toBe(true);
    const many = await makeUser(db);
    for (let i = 0; i < MAX_CONNECTIONS; i++) await createConnection(db, many, openai({ label: `M${i}`, secret: null }));
    await expect(createConnection(db, many, openai({ label: "One more", secret: null }))).rejects.toMatchObject({ reason: "limit" });
  });
});
