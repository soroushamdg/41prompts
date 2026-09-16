import {
  HAS_TEST_DATABASE,
  announceDatabaseSkip,
  createDb,
  generateMasterKey,
  providerKeyMetadata,
  providerKeys,
  putProviderKey,
  setProviderKeyEnabled,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { testStoredProviderKey } from "./test-key";

const OWNER = "usr_test_key_job";
const MASTER = generateMasterKey();
const KEY = "sk-proj-AVeryRecognisableSecret00000";

announceDatabaseSkip("testStoredProviderKey");

/** A `fetch` that records what it was asked and answers with a status of our choosing. */
function stub(status: number, body = "") {
  const seen: { url?: string; headers?: Record<string, string> }[] = [];
  const impl = (async (input: unknown, init?: unknown) => {
    const request = (init ?? {}) as { headers?: Record<string, string> };
    seen.push({ url: String(input), headers: request.headers ?? {} });
    return new Response(body, { status });
  }) as unknown as typeof globalThis.fetch;
  return { seen, impl };
}

describe.skipIf(!HAS_TEST_DATABASE)("testStoredProviderKey", () => {
  let db: Db;
  const env = { KEY_ENCRYPTION_SECRET: MASTER.secret };

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Test key", email: `${OWNER}@example.com`, emailVerified: true });
    // The job reads the master key from the process environment, because it is the worker and the
    // worker is the process that holds it. Set for the length of this file only.
    process.env.KEY_ENCRYPTION_SECRET = env.KEY_ENCRYPTION_SECRET;
  });

  beforeEach(async () => {
    await db.delete(providerKeys).where(eq(providerKeys.owner, OWNER));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
    delete process.env.KEY_ENCRYPTION_SECRET;
  });

  it("records a pass, and clears the request so the page stops saying it is checking", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: KEY, env });
    const { seen, impl } = stub(200, "{}");

    expect(await testStoredProviderKey(db, OWNER, "openai", impl)).toBe(true);

    const [row] = await providerKeyMetadata(db, OWNER);
    expect(row!.lastTestOk).toBe(true);
    expect(row!.lastTestedAt).not.toBeNull();
    expect(row!.testRequestedAt).toBeNull();
    expect(row!.lastTestDetail).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it("records a failure in the provider's own terms", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: KEY, env });
    expect(await testStoredProviderKey(db, OWNER, "openai", stub(401, "incorrect api key").impl)).toBe(false);

    const [row] = await providerKeyMetadata(db, OWNER);
    expect(row!.lastTestOk).toBe(false);
    expect(row!.lastTestDetail).toContain("OpenAI");
  });

  /**
   * The assertion this file exists for. The plaintext passes through this function and must not
   * come out of it — not in the row, not in the detail, not anywhere a page or a log can reach.
   */
  it("never writes the key into the row, even when the provider echoes it back", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: KEY, env });
    // A provider that echoes the credential in its error body. Some do.
    await testStoredProviderKey(db, OWNER, "openai", stub(401, `Incorrect API key provided: ${KEY}`).impl);

    const [row] = await providerKeyMetadata(db, OWNER);
    expect(row!.lastTestDetail).not.toContain(KEY);
    expect(row!.lastTestDetail).toContain("[redacted]");
    expect(JSON.stringify(row)).not.toContain(KEY);
  });

  it("says so rather than calling anybody when there is no key", async () => {
    expect(await testStoredProviderKey(db, OWNER, "google", stub(200).impl)).toBe(false);
    expect(await providerKeyMetadata(db, OWNER)).toHaveLength(0);
  });

  it("does not test a key that is switched off", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: KEY, env });
    await setProviderKeyEnabled(db, OWNER, "openai", false);
    const { seen, impl } = stub(200, "{}");

    expect(await testStoredProviderKey(db, OWNER, "openai", impl)).toBe(false);
    expect(seen).toHaveLength(0);
    const [row] = await providerKeyMetadata(db, OWNER);
    expect(row!.lastTestDetail).toContain("switched off");
  });

  it("refuses a job naming a provider that does not exist", async () => {
    expect(await testStoredProviderKey(db, OWNER, "mistral", stub(200).impl)).toBe(false);
  });
});
