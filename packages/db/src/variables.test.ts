import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import { eq } from "drizzle-orm";
import { addBlok, bloksForPrompt } from "./canvas";
import {
  applyRename,
  declareVariable,
  setVariableDetails,
  undeclareVariable,
  variablesForPrompt,
} from "./variables";
import { createDb, type Db } from "./client";
import { newProjectId } from "./ids";
import { projects, prompts, users } from "./schema";

/**
 * Against the shared development database, cleaned up by owner, exactly like `canvas.test.ts`.
 *
 * The test that matters here is the rename transaction. `renameVariable`'s own tests live in
 * `@41prompts/core` and were written before it; these cover the half core cannot see — that the
 * texts and the declaration row move **together**, and that a prompt cannot be left with half its
 * occurrences renamed.
 */
const OWNER = "variables-test-owner";

announceDatabaseSkip("declared variables");

describe.skipIf(!HAS_TEST_DATABASE)("declared variables, owner-scoped", () => {
  let db: Db;
  let promptId: string;

  beforeAll(() => {
    const databaseUrl = testDatabaseUrl();
    db = createDb(databaseUrl);
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, OWNER));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "variables-owner@example.test" });
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: OWNER, name: "Vars", slug: `vars-${project}` });
    const [row] = await db.insert(prompts).values({ project, name: "Router" }).returning({ id: prompts.id });
    promptId = row!.id;
  });

  afterAll(clear);

  it("declares a variable and reads it back in name order", async () => {
    await declareVariable(db, promptId, { name: "zebra", defaultValue: null, description: null });
    await declareVariable(db, promptId, { name: "alpha", defaultValue: "a", description: "first" });
    expect((await variablesForPrompt(db, promptId)).map((v) => v.name)).toEqual(["alpha", "zebra"]);
  });

  it("refuses a duplicate name with an answer rather than an exception", async () => {
    await declareVariable(db, promptId, { name: "one", defaultValue: null, description: null });
    const second = await declareVariable(db, promptId, { name: "one", defaultValue: "x", description: null });
    expect(second).toBe("exists");
    expect(await variablesForPrompt(db, promptId)).toHaveLength(1);
  });

  it("keeps an empty default distinct from no default", async () => {
    await declareVariable(db, promptId, { name: "extra", defaultValue: "", description: null });
    await declareVariable(db, promptId, { name: "must", defaultValue: null, description: null });
    const rows = await variablesForPrompt(db, promptId);
    expect(rows.find((r) => r.name === "extra")?.defaultValue).toBe("");
    expect(rows.find((r) => r.name === "must")?.defaultValue).toBeNull();
  });

  it("edits details without touching the name", async () => {
    await declareVariable(db, promptId, { name: "one", defaultValue: null, description: null });
    const [row] = await variablesForPrompt(db, promptId);
    await setVariableDetails(db, promptId, row!.id, { defaultValue: "Acme", description: "the vendor" });
    const [after] = await variablesForPrompt(db, promptId);
    expect(after).toMatchObject({ name: "one", defaultValue: "Acme", description: "the vendor" });
  });

  it("undeclares", async () => {
    await declareVariable(db, promptId, { name: "one", defaultValue: null, description: null });
    const [row] = await variablesForPrompt(db, promptId);
    await undeclareVariable(db, promptId, row!.id);
    expect(await variablesForPrompt(db, promptId)).toEqual([]);
  });

  it("does not reach a variable belonging to another prompt", async () => {
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: OWNER, name: "Other", slug: `other-${project}` });
    const [other] = await db.insert(prompts).values({ project, name: "Other" }).returning({ id: prompts.id });
    await declareVariable(db, other!.id, { name: "theirs", defaultValue: null, description: null });

    const [row] = await variablesForPrompt(db, other!.id);
    await undeclareVariable(db, promptId, row!.id);
    // Scoped by prompt, so the delete matched nothing rather than reaching across.
    expect(await variablesForPrompt(db, other!.id)).toHaveLength(1);
  });

  /**
   * The one that matters. A prompt with half its occurrences renamed still compiles and still reads
   * plausibly, so a partial write here would be silent.
   */
  it("moves every text and the declaration together", async () => {
    await addBlok(db, promptId, { kind: "context", text: "You work for {{company}}." });
    await addBlok(db, promptId, { kind: "constraint", text: "Never speak for {{company}}." });
    await declareVariable(db, promptId, { name: "company", defaultValue: "Acme", description: "the vendor" });

    const rows = await bloksForPrompt(db, promptId);
    const [declaration] = await variablesForPrompt(db, promptId);

    await applyRename(db, promptId, {
      blokTexts: rows.map((r) => ({ id: r.id, text: r.text.replace("{{company}}", "{{vendor}}") })),
      editedTexts: [],
      declarationId: declaration!.id,
      name: "vendor",
    });

    expect((await bloksForPrompt(db, promptId)).map((r) => r.text)).toEqual([
      "You work for {{vendor}}.",
      "Never speak for {{vendor}}.",
    ]);
    const [after] = await variablesForPrompt(db, promptId);
    expect(after).toMatchObject({ name: "vendor", defaultValue: "Acme", description: "the vendor" });
  });

  it("carries a hand edit's hash through a rename unchanged", async () => {
    const blok = await addBlok(db, promptId, { kind: "context", text: "For {{company}}." });
    await declareVariable(db, promptId, { name: "company", defaultValue: null, description: null });
    const [declaration] = await variablesForPrompt(db, promptId);

    await applyRename(db, promptId, {
      blokTexts: [{ id: blok.id, text: "For {{vendor}}." }],
      editedTexts: [{ id: blok.id, text: "For {{vendor}}, warmly.", fromHash: "abc123" }],
      declarationId: declaration!.id,
      name: "vendor",
    });

    const [row] = await bloksForPrompt(db, promptId);
    expect(row).toMatchObject({
      text: "For {{vendor}}.",
      editedText: "For {{vendor}}, warmly.",
      // Unchanged: a rename is not a new hand edit, and a recomputed hash would answer "no" to
      // "has the blok changed since you edited this" for ever.
      editedFromHash: "abc123",
    });
  });

  it("writes nothing when the transaction cannot finish", async () => {
    const blok = await addBlok(db, promptId, { kind: "context", text: "For {{company}}." });
    await declareVariable(db, promptId, { name: "company", defaultValue: null, description: null });
    const [declaration] = await variablesForPrompt(db, promptId);

    // The blok update is ordered first and the declaration update last, so a failure on the last
    // one is the case worth proving: without a transaction the text would already be renamed and
    // the declaration would still say `company`, which is the half-renamed prompt this design
    // exists to make impossible. `name` is NOT NULL, and the row exists, so the update is evaluated
    // and rejected rather than matching nothing.
    await expect(
      applyRename(db, promptId, {
        blokTexts: [{ id: blok.id, text: "For {{vendor}}." }],
        editedTexts: [],
        declarationId: declaration!.id,
        name: null as unknown as string,
      })
    ).rejects.toThrow();

    expect((await bloksForPrompt(db, promptId))[0]?.text).toBe("For {{company}}.");
    expect((await variablesForPrompt(db, promptId))[0]?.name).toBe("company");
  });
});
