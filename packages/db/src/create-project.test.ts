import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "./client";
import { PROJECT_ID_ATTEMPTS, ProjectIdExhausted, insertProject } from "./create-project";
import { projects, users } from "./schema";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";

/**
 * The project-id retry (EPIC-053).
 *
 * **The assertion that matters is that the retry FIRES**, not that inserting a project works.
 * Every test here would pass against the old code that had no retry at all, except the two that
 * force a collision — and forcing one is the only way to test this, because `proj_` + 4 hex draws
 * an unused id nearly every time. That is exactly how the defect survived: it worked in every test
 * and failed once per few hundred real inserts.
 *
 * `docs/PROCESS.md`, lesson 8: before asserting a thing does not happen, prove the search can find
 * it. Here, before asserting the retry saves you, prove the collision it saves you from is real.
 */

const OWNER = "create-project-test-owner";

announceDatabaseSkip("the create-project suite");

describe.skipIf(!HAS_TEST_DATABASE)("insertProject", () => {
  let db: Db;
  const made: string[] = [];

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  beforeEach(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Owner", email: `${OWNER}@example.com`, emailVerified: true });
    made.length = 0;
  });

  afterAll(async () => {
    if (made.length > 0) await db.delete(projects).where(inArray(projects.id, made));
    await db.delete(users).where(eq(users.id, OWNER));
  });

  const make = async (name: string): Promise<string> => {
    const id = await insertProject(db, { owner: OWNER, name, slugFor: (projectId) => `${name}-${projectId}` });
    made.push(id);
    return id;
  };

  it("inserts a project and returns the id it got", async () => {
    const id = await make("first");
    expect(id).toMatch(/^proj_[0-9a-f]{4}$/);

    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    expect(row?.name).toBe("first");
    expect(row?.slug).toBe(`first-${id}`);
  });

  it("draws a different id every time", async () => {
    const ids = [await make("a"), await make("b"), await make("c")];
    expect(new Set(ids).size).toBe(3);
  });

  /**
   * The collision, forced — and this is the only pair of tests here that the version with no retry
   * would fail. Everything above passes either way.
   */
  it("draws again when the id it minted is already taken", async () => {
    const taken = await make("taken");

    // A generator that hands back the taken id twice before a usable one. If `insertProject` did
    // not retry, the first draw would throw and this would fail rather than return.
    const drawn: string[] = [];
    const fresh = "proj_beef";
    const id = await insertProject(
      db,
      { owner: OWNER, name: "second", slugFor: (projectId) => `second-${projectId}` },
      () => {
        const next = drawn.length < 2 ? taken : fresh;
        drawn.push(next);
        return next;
      },
    );
    made.push(id);

    expect(drawn).toEqual([taken, taken, fresh]);
    expect(id).toBe(fresh);
    const [row] = await db.select().from(projects).where(eq(projects.id, fresh));
    expect(row?.name).toBe("second");
  });

  it("gives up after PROJECT_ID_ATTEMPTS rather than looping for ever", async () => {
    const taken = await make("wall");
    let draws = 0;

    await expect(
      insertProject(
        db,
        { owner: OWNER, name: "never", slugFor: (projectId) => `never-${projectId}` },
        () => {
          draws += 1;
          return taken;
        },
      ),
    ).rejects.toBeInstanceOf(ProjectIdExhausted);

    // Exactly the budget, not one more and not for ever. A systematic failure must surface as an
    // error rather than as a hang.
    expect(draws).toBe(PROJECT_ID_ATTEMPTS);
  });

  it("names how many attempts it made, so a log line explains itself", () => {
    expect(new ProjectIdExhausted(PROJECT_ID_ATTEMPTS).message).toContain(String(PROJECT_ID_ATTEMPTS));
    expect(PROJECT_ID_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });

  it("does not retry an error that is not a collision", async () => {
    // A bad owner violates a foreign key, not a unique constraint. Retrying it would turn one real
    // failure into four and report `ProjectIdExhausted` — the wrong cause, and the one that would
    // send somebody looking at id widths instead of at the row they passed.
    let draws = 0;
    const failure = await insertProject(
      db,
      { owner: "nobody-by-that-id", name: "orphan", slugFor: (id) => `orphan-${id}` },
      () => {
        draws += 1;
        return "proj_dead";
      },
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(ProjectIdExhausted);
    expect(draws).toBe(1);
  });
});
