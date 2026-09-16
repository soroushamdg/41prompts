import {
  DEFAULT_MODEL_FOR,
  HAS_TEST_DATABASE,
  announceDatabaseSkip,
  createDb,
  generateMasterKey,
  projects,
  prompts,
  providerKeyMetadata,
  putProviderKey,
  providerKeys,
  setProviderKeyEnabled,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deploymentProviders, providerForRun } from "./provider";

const OWNER = "usr_provider_for_run";
const PROJECT = "proj_pfr0";
const PROMPT = "pr_pfr00001";

/** A master key generated for this file. Never a committed one, and never one an environment holds. */
const MASTER = generateMasterKey();
const KEY_ENV = { KEY_ENCRYPTION_SECRET: MASTER.secret };

const THEIR_OPENAI_KEY = "sk-proj-Their0wnKeyNotOurs0000000000";
const OUR_OPENAI_KEY = "sk-proj-Ours000000000000000000000000";

announceDatabaseSkip("providerForRun");

describe.skipIf(!HAS_TEST_DATABASE)("providerForRun", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "BYO", email: `${OWNER}@example.com`, emailVerified: true });
    await db.insert(projects).values({ id: PROJECT, owner: OWNER, name: "BYO", slug: `byo-${PROJECT}` });
    await db.insert(prompts).values({ id: PROMPT, project: PROJECT, name: "BYO" });
  });

  beforeEach(async () => {
    await db.delete(providerKeys).where(eq(providerKeys.owner, OWNER));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
  });

  it("refuses in words when nobody has a key for this model's provider", async () => {
    const selected = await providerForRun(db, { owner: OWNER, model: DEFAULT_MODEL_FOR.openai }, KEY_ENV);
    expect(selected).toBeUndefined();
  });

  it("falls back to the deployment's own key when the person has not brought one", async () => {
    const selected = await providerForRun(
      db,
      { owner: OWNER, model: DEFAULT_MODEL_FOR.openai },
      { ...KEY_ENV, OPENAI_API_KEY: OUR_OPENAI_KEY },
    );
    expect(selected?.name).toBe("openai");
  });

  it("prefers the person's own key over the deployment's, and says which it used", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: THEIR_OPENAI_KEY, env: KEY_ENV });
    const selected = await providerForRun(
      db,
      { owner: OWNER, model: DEFAULT_MODEL_FOR.openai },
      { ...KEY_ENV, OPENAI_API_KEY: OUR_OPENAI_KEY },
    );
    expect(selected?.name).toBe("openai (your key)");
    // The name is for a log. It must never be able to carry the thing it is about.
    expect(selected?.name).not.toContain(THEIR_OPENAI_KEY);
  });

  /** A4: the column the settings page reads, stamped by the only function that can produce a key. */
  it("stamps last_used_at when it opens a stored key", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: THEIR_OPENAI_KEY, env: KEY_ENV });
    expect((await providerKeyMetadata(db, OWNER))[0]!.lastUsedAt).toBeNull();

    await providerForRun(db, { owner: OWNER, model: DEFAULT_MODEL_FOR.openai }, KEY_ENV);
    expect((await providerKeyMetadata(db, OWNER))[0]!.lastUsedAt).not.toBeNull();
  });

  /** A7: switched off is not the same as removed, and a run must honour it. */
  it("does not reach for a key the person has switched off", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: THEIR_OPENAI_KEY, env: KEY_ENV });
    await setProviderKeyEnabled(db, OWNER, "openai", false);

    // With no deployment key either, there is nothing left, so the refusal proves the row was
    // skipped rather than merely that something else was preferred.
    expect(await providerForRun(db, { owner: OWNER, model: DEFAULT_MODEL_FOR.openai }, KEY_ENV)).toBeUndefined();

    // And the fallback is still reached, so "off" means "not this key", not "no runs".
    const withOurs = await providerForRun(
      db,
      { owner: OWNER, model: DEFAULT_MODEL_FOR.openai },
      { ...KEY_ENV, OPENAI_API_KEY: OUR_OPENAI_KEY },
    );
    expect(withOurs?.name).toBe("openai");

    await setProviderKeyEnabled(db, OWNER, "openai", true);
    expect((await providerForRun(db, { owner: OWNER, model: DEFAULT_MODEL_FOR.openai }, KEY_ENV))?.name).toBe(
      "openai (your key)",
    );
  });

  it("does not use an Anthropic key for a Gemini model, or the other way round", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "anthropic", plaintext: "sk-ant-TheirClaudeKey000000", env: KEY_ENV });
    expect(await providerForRun(db, { owner: OWNER, model: DEFAULT_MODEL_FOR.google }, KEY_ENV)).toBeUndefined();
    expect((await providerForRun(db, { owner: OWNER, model: DEFAULT_MODEL_FOR.anthropic }, KEY_ENV))?.name).toBe(
      "anthropic (your key)",
    );
  });

  it("has no provider for a model the catalogue does not carry", async () => {
    const selected = await providerForRun(
      db,
      { owner: OWNER, model: "gpt-5-imaginary" },
      { ...KEY_ENV, OPENAI_API_KEY: OUR_OPENAI_KEY },
    );
    expect(selected).toBeUndefined();
  });

  /**
   * The fake's three guards, unchanged and re-asserted on the new path — a selector that honoured
   * them in `providerFor` and not here would let a stored key decide whether the e2e suite calls a
   * real model.
   */
  it("keeps the fake's three guards", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: THEIR_OPENAI_KEY, env: KEY_ENV });
    const model = DEFAULT_MODEL_FOR.openai;

    expect((await providerForRun(db, { owner: OWNER, model }, { ...KEY_ENV, FAKE_PROVIDER: "1" }))?.name).toContain(
      "fake",
    );
    expect(
      (await providerForRun(db, { owner: OWNER, model }, { ...KEY_ENV, FAKE_PROVIDER: "0" }))?.name,
    ).not.toContain("fake");
    expect(
      (await providerForRun(db, { owner: OWNER, model }, { ...KEY_ENV, FAKE_PROVIDER: "1", DEPLOY_ENV: "production" }))
        ?.name,
    ).not.toContain("fake");
  });

  /**
   * **A key that cannot be opened is an incident, not a fall-through.** Quietly running somebody's
   * prompt on the platform's key instead would spend our money against their intent and hide a
   * missing master key behind a run that worked.
   */
  it("throws rather than silently using the deployment's key when a stored one cannot be opened", async () => {
    await putProviderKey(db, { owner: OWNER, provider: "openai", plaintext: THEIR_OPENAI_KEY, env: KEY_ENV });
    const otherMaster = generateMasterKey();
    await expect(
      providerForRun(
        db,
        { owner: OWNER, model: DEFAULT_MODEL_FOR.openai },
        { KEY_ENCRYPTION_SECRET: otherMaster.secret, OPENAI_API_KEY: OUR_OPENAI_KEY },
      ),
    ).rejects.toThrow();
  });
});

describe("deploymentProviders", () => {
  it("names only the providers this deployment holds a key for", () => {
    expect(deploymentProviders({})).toEqual([]);
    expect(deploymentProviders({ ANTHROPIC_API_KEY: "x", GOOGLE_API_KEY: "y" })).toEqual(["anthropic", "google"]);
    // An empty string is not a key. It is what an unset variable looks like in a compose file.
    expect(deploymentProviders({ OPENAI_API_KEY: "" })).toEqual([]);
  });
});
