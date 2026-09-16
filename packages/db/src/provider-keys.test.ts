import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import { createDb, type Db } from "./client";
import { providerKeys, users } from "./schema";
import {
  deleteProviderKey,
  isProviderName,
  masterKeyIdOfStoredRow,
  openStoredProviderKey,
  providerKeyMetadata,
  putProviderKey,
} from "./provider-keys";
import { generateMasterKey, masterKeyFromSecret } from "./sealed-box";

const OWNER = "provider-keys-test-owner";
const OTHER = "provider-keys-test-other";

/** A key shaped like Anthropic's, so the assertions are about a realistic string. */
const KEY = "sk-ant-api03-Zq7WcR2mLv9Xb4Nt6Kd1Pf8Hj3Ug5Ay0Se";
const OPENAI_KEY = "sk-proj-Tn4Vb8Qw2Ls6Mx1Zc9Rd7Kj3Hg5Yf0Pa";

const master = generateMasterKey();
const ENV = { KEY_ENCRYPTION_SECRET: master.secret };

announceDatabaseSkip("the provider key store suite");

describe.skipIf(!HAS_TEST_DATABASE)("the provider key store", () => {
  let db: Db;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    for (const id of [OWNER, OTHER]) {
      await db.delete(users).where(eq(users.id, id));
    }
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values([
      { id: OWNER, name: OWNER, email: "provider-keys-owner@example.test" },
      { id: OTHER, name: OTHER, email: "provider-keys-other@example.test" },
    ]);
  });

  afterAll(clear);

  it("stores a key and gives it back", async () => {
    const stored = await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });
    expect(stored).toMatchObject({ provider: "anthropic", lastFour: KEY.slice(-4), keyId: master.keyId });
    expect(await openStoredProviderKey(db, OWNER, "anthropic", ENV)).toBe(KEY);
  });

  it("says nothing rather than throwing when this person has no key at that provider", async () => {
    expect(await openStoredProviderKey(db, OWNER, "google", ENV)).toBeUndefined();
  });

  /**
   * The roadmap's own test: "backup dump contains ciphertext only".
   *
   * ## What is asserted, and what is not
   *
   * A dump's data section is each row's columns in their **text representation**, which is what
   * `row::text` renders — so that is what this asserts, computed by Postgres rather than by
   * concatenating values in JavaScript, because the question is what the database emits.
   *
   * `COPY ... TO STDOUT` was the obvious thing to reach for and it is a **trap**: node-postgres
   * returns `{ command: "COPY", rowCount: 1, rows: [] }` and the copy data never reaches the client
   * without `pg-copy-streams`. An assertion over that result passes whatever the table contains.
   * Probed before it was believed (`docs/PROCESS.md`, "When a symptom looks environmental, probe the
   * thing"), which is the only reason this test asserts something.
   *
   * Every assertion below has a **positive control** — the envelope must be present — so the test
   * fails rather than passes if the string it is searching ever comes back empty.
   *
   * `pg_dump` itself is not invoked here: it is not on this machine's PATH, only inside the Postgres
   * container. The drive (`scripts/drive-epic-043.mjs`) runs the real one against the real row.
   */
  it("holds ciphertext only — in the row, and in the text a dump would carry", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });

    const [row] = await db.select().from(providerKeys).where(eq(providerKeys.owner, OWNER));
    expect(row?.sealed.startsWith("41pk1.")).toBe(true);

    // Every column of the row, as text. Nothing here may contain the key.
    const everyColumn = Object.values(row ?? {})
      .map((value) => String(value))
      .join("|");
    expect(everyColumn).toContain(row?.sealed);
    expect(everyColumn).not.toContain(KEY);
    // The last four are stored on purpose and are what a person recognises the key by; anything
    // longer would be key material. Eight characters of a real key must appear nowhere.
    expect(everyColumn).not.toContain(KEY.slice(-8));

    const rendered = await db.execute<{ row_text: string }>(
      sql`select each::text as row_text from provider_keys each`,
    );
    const dumpText = rendered.rows.map((each) => each.row_text).join("\n");
    expect(dumpText).toContain(row?.sealed);
    expect(dumpText).not.toContain(KEY);
    expect(dumpText).not.toContain(KEY.slice(-8));
  });

  /**
   * The control for the test above: the same rendering, over a table that **does** hold a plaintext
   * key, must find it. Without this, "the dump does not contain the key" could be true because the
   * search is broken rather than because the store is sealed — which is exactly what `COPY ... TO
   * STDOUT` was doing before it was probed.
   */
  it("the dump-shaped search can actually find a key when one is there", async () => {
    await db.execute(sql`create temporary table naive_keys (owner text, api_key text)`);
    await db.execute(sql`insert into naive_keys values (${OWNER}, ${KEY})`);
    const rendered = await db.execute<{ row_text: string }>(
      sql`select each::text as row_text from naive_keys each`,
    );
    expect(rendered.rows.map((each) => each.row_text).join("\n")).toContain(KEY);
    await db.execute(sql`drop table naive_keys`);
  });

  it("reads metadata with no master key configured at all", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: OPENAI_KEY, env: ENV });

    const metadata = await providerKeyMetadata(db, OWNER);
    expect(metadata.map((each) => each.provider)).toEqual(["anthropic", "openai"]);
    expect(metadata.map((each) => each.lastFour)).toEqual([KEY.slice(-4), OPENAI_KEY.slice(-4)]);
    // The envelope is not in the shape a page renders, so it cannot reach a template by accident.
    expect(Object.keys(metadata[0] ?? {})).not.toContain("sealed");
  });

  it("replaces rather than accumulating, and records that it was replaced", async () => {
    const first = await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });
    expect(first.rotatedAt).toBeNull();

    const replacement = "sk-ant-api03-Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk";
    const second = await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: replacement, env: ENV });

    expect(second.rotatedAt).not.toBeNull();
    expect(await providerKeyMetadata(db, OWNER)).toHaveLength(1);
    expect(await openStoredProviderKey(db, OWNER, "anthropic", ENV)).toBe(replacement);
  });

  it("keeps two people's keys apart, and neither opens as the other", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });
    await putProviderKey(db, { owner: OTHER, provider: "anthropic", plaintext: OPENAI_KEY, env: ENV });

    expect(await openStoredProviderKey(db, OWNER, "anthropic", ENV)).toBe(KEY);
    expect(await openStoredProviderKey(db, OTHER, "anthropic", ENV)).toBe(OPENAI_KEY);

    // The binding, proved through the store rather than only in the sealed-box suite: move the
    // envelope to the other person's row and it stops opening.
    const [mine] = await db.select().from(providerKeys).where(eq(providerKeys.owner, OWNER));
    await db.update(providerKeys).set({ sealed: mine!.sealed }).where(eq(providerKeys.owner, OTHER));
    await expect(openStoredProviderKey(db, OTHER, "anthropic", ENV)).rejects.toThrow(/different person or provider/);
  });

  it("forgets a key when asked, and says whether there was one", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });
    expect(await deleteProviderKey(db, OWNER, "anthropic")).toBe(true);
    expect(await deleteProviderKey(db, OWNER, "anthropic")).toBe(false);
    expect(await providerKeyMetadata(db, OWNER)).toHaveLength(0);
  });

  it("goes with the person when the account is deleted", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: ENV });
    await db.delete(users).where(eq(users.id, OWNER));
    expect(await providerKeyMetadata(db, OWNER)).toHaveLength(0);
  });

  it("refuses in words when no master key is configured", async () => {
    await expect(putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: {} })).rejects.toThrow(
      /KEY_ENCRYPTION_SECRET/,
    );
  });

  it("refuses something too short to be a key", async () => {
    await expect(
      putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: "sk-", env: ENV }),
    ).rejects.toThrow(/shorter than eight/);
  });

  it("opens a row sealed under an older master key while a new one seals", async () => {
    const older = generateMasterKey();
    await putProviderKey(db, {
      owner: OWNER,
      provider: "anthropic",
      plaintext: KEY,
      env: { KEY_ENCRYPTION_SECRET: older.secret },
    });

    const both = { KEY_ENCRYPTION_SECRET: `${master.secret},${older.secret}` };
    const [row] = await db.select().from(providerKeys).where(eq(providerKeys.owner, OWNER));
    expect(masterKeyIdOfStoredRow(row!.sealed)).toBe(older.keyId);
    expect(await openStoredProviderKey(db, OWNER, "anthropic", both)).toBe(KEY);

    // Re-sealing is an ordinary write with the new key first, which is what a rotation job does.
    const rotated = await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: KEY, env: both });
    expect(rotated.keyId).toBe(master.keyId);
    expect(masterKeyFromSecret(master.secret).keyId).toBe(master.keyId);
  });
});

describe("the closed set of providers", () => {
  it("accepts the three that are named and nothing else", () => {
    expect(isProviderName("anthropic")).toBe(true);
    expect(isProviderName("openai")).toBe(true);
    expect(isProviderName("google")).toBe(true);
    expect(isProviderName("mistral")).toBe(false);
  });
});
