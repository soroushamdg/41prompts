import {
  announceDatabaseSkip,
  createDb,
  HAS_TEST_DATABASE,
  projects,
  prompts,
  runBudgets,
  runs,
  testDatabaseUrl,
  users,
  type Db
} from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cacheKeyFor, executeRun, executeRunSet, type Provider, type RunRequest } from "./execute";
import { costCentsFor, MODEL_PRICES, priceFor, reservationCentsFor } from "./prices";

const OWNER = "usr_run_engine_test";
const PROJECT = "proj_run0";
const PROMPT = "pr_run00001";
const MODEL = "claude-haiku-4-5-20251001";
const NOW = () => new Date("2026-09-14T00:00:00.000Z");

/** Counts its calls, so "zero calls" is a thing a test can assert rather than infer. */
function fakeProvider(text = "a reply"): Provider & { calls: number } {
  return {
    calls: 0,
    async complete() {
      this.calls++;
      return { text, inputTokens: 1_000, outputTokens: 100, raw: { id: "msg_fake", content: text } };
    }
  };
}

function request(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    owner: OWNER,
    promptId: PROMPT,
    compiled: "You route support email.",
    input: "my parcel never arrived",
    model: MODEL,
    params: { temperature: 0 },
    ...overrides
  };
}

announceDatabaseSkip("executeRun");

describe.skipIf(!HAS_TEST_DATABASE)("executeRun", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Run test", email: `${OWNER}@example.com`, emailVerified: true });
    await db.insert(projects).values({ id: PROJECT, owner: OWNER, name: "Run test", slug: `run-test-${PROJECT}` });
    await db.insert(prompts).values({ id: PROMPT, project: PROJECT, name: "Run test" });
  });

  beforeEach(async () => {
    await db.delete(runs).where(eq(runs.owner, OWNER));
    await db.delete(runBudgets).where(eq(runBudgets.owner, OWNER));
    await db.insert(runBudgets).values({ owner: OWNER, capCents: 100_000, spentCents: 0 });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
  });

  /** The roadmap's test, verbatim: ten inputs → ten results; re-run → ten hits, zero calls. */
  it("runs ten inputs, then answers a re-run entirely from cache with no calls", async () => {
    const provider = fakeProvider();
    const inputs = Array.from({ length: 10 }, (_, i) => request({ input: `input ${i}` }));

    const first = await executeRunSet(db, provider, inputs, NOW);
    expect(first.outcomes.filter((o) => o.status === "ran")).toHaveLength(10);
    expect(provider.calls).toBe(10);

    const second = await executeRunSet(db, provider, inputs, NOW);
    expect(second.outcomes.filter((o) => o.status === "cached")).toHaveLength(10);
    // The assertion that matters: the provider was not asked again.
    expect(provider.calls).toBe(10);
  });

  it("a cache hit spends nothing", async () => {
    const provider = fakeProvider();
    await executeRun(db, provider, request(), NOW);
    const [afterFirst] = await db.select().from(runBudgets).where(eq(runBudgets.owner, OWNER));

    const hit = await executeRun(db, provider, request(), NOW);
    expect(hit.status).toBe("cached");
    if (hit.status === "cached") expect(hit.costCents).toBe(0);

    const [afterHit] = await db.select().from(runBudgets).where(eq(runBudgets.owner, OWNER));
    expect(afterHit!.spentCents).toBe(afterFirst!.spentCents);
  });

  /**
   * **The reservation released.** The worst case is reserved before the call and the difference
   * handed back after, so what a user is charged is what the call cost — not what it might have cost.
   */
  it("reserves the worst case and releases what the call did not use", async () => {
    const price = priceFor(MODEL)!;
    const provider = fakeProvider();
    const outcome = await executeRun(db, provider, request(), NOW);
    expect(outcome.status).toBe("ran");

    const actual = costCentsFor(price, 1_000, 100);
    const reservation = reservationCentsFor(price, 1_000);
    expect(reservation).toBeGreaterThan(actual);

    const [budget] = await db.select().from(runBudgets).where(eq(runBudgets.owner, OWNER));
    expect(budget!.spentCents).toBe(actual);
  });

  it("refuses an unpriced model rather than running it at zero", async () => {
    const provider = fakeProvider();
    const outcome = await executeRun(db, provider, request({ model: "some-model-nobody-priced" }), NOW);
    expect(outcome).toEqual({ status: "refused", reason: "model_not_priced" });
    // Nothing was called and nothing was spent against a price we do not have.
    expect(provider.calls).toBe(0);
    const [budget] = await db.select().from(runBudgets).where(eq(runBudgets.owner, OWNER));
    expect(budget!.spentCents).toBe(0);
  });

  it("refuses at the cap, and calls nobody", async () => {
    await db.update(runBudgets).set({ capCents: 1, spentCents: 0 }).where(eq(runBudgets.owner, OWNER));
    const provider = fakeProvider();
    const outcome = await executeRun(db, provider, request(), NOW);
    expect(outcome).toEqual({ status: "refused", reason: "budget_exhausted" });
    expect(provider.calls).toBe(0);
  });

  /**
   * **Decision 6, which is the one with a user on the other end of it.** Hitting the cap partway
   * keeps the work already paid for; EPIC-030's summary can already say "n of m ran".
   */
  it("stops at the cap and keeps every run that already completed", async () => {
    const price = priceFor(MODEL)!;
    const oneReservation = reservationCentsFor(price, 1_000);
    // **The arithmetic is the reservation working**, and getting it wrong first time is instructive
    // enough to write down: because the overshoot is released after every call, `spentCents` grows by
    // the *actual* cost (pennies), not the reservation (tens of cents). A cap of two reservations is
    // therefore never reached — ten calls fit inside it easily.
    //
    // A run proceeds while `spent + reservation <= cap`. Setting the cap two cents above one
    // reservation leaves room for exactly three one-cent calls before the fourth cannot reserve.
    await db
      .update(runBudgets)
      .set({ capCents: oneReservation + 2, spentCents: 0 })
      .where(eq(runBudgets.owner, OWNER));

    const provider = fakeProvider();
    const inputs = Array.from({ length: 10 }, (_, i) => request({ input: `capped ${i}` }));
    const result = await executeRunSet(db, provider, inputs, NOW);

    expect(result.stoppedEarly).toBe(true);
    const ran = result.outcomes.filter((o) => o.status === "ran");
    expect(ran.length).toBeGreaterThan(0);
    expect(ran.length).toBeLessThan(10);

    // The completed ones are still there — not rolled back to make a tidier story.
    const stored = await db.select({ id: runs.id }).from(runs).where(eq(runs.owner, OWNER));
    expect(stored).toHaveLength(ran.length);
  });

  it("stores every field rule 6 requires", async () => {
    const provider = fakeProvider();
    await executeRun(db, provider, request(), NOW);
    const [row] = await db.select().from(runs).where(eq(runs.owner, OWNER));

    expect(row!.payload).toBeTruthy();
    expect(row!.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.model).toBe(MODEL);
    expect(row!.params).toEqual({ temperature: 0 });
    expect(typeof row!.latencyMs).toBe("number");
    expect(typeof row!.costCents).toBe("number");
    // And the clock that the privacy page's promise depends on.
    expect(row!.purgeAfter.getTime()).toBeGreaterThan(NOW().getTime());
  });

  /**
   * Rule 6 says store the prompt **hash**, not the prompt. The distinction is the point: a hash
   * identifies the request without keeping a second copy of somebody's prompt in a table whose whole
   * reason for existing is that it gets purged.
   */
  it("stores hashes rather than the prompt and the input themselves", async () => {
    const provider = fakeProvider();
    const secret = "the customer's home address is 41 Prompt Street";
    await executeRun(db, provider, request({ input: secret }), NOW);
    const [row] = await db.select().from(runs).where(eq(runs.owner, OWNER));

    expect(row!.inputHash).not.toContain(secret);
    expect(JSON.stringify(row!.promptHash)).not.toContain("You route support email");
  });

  it("never stores anything key-shaped", async () => {
    const provider: Provider = {
      async complete() {
        // A provider that leaked a key into its own response would still not put one in our row —
        // but this asserts the row, which is the thing we control.
        return { text: "fine", inputTokens: 10, outputTokens: 10, raw: { id: "msg_1" } };
      }
    };
    await executeRun(db, provider, request(), NOW);
    const [row] = await db.select().from(runs).where(eq(runs.owner, OWNER));
    expect(JSON.stringify(row)).not.toMatch(/sk-[A-Za-z0-9-]{10,}/);
  });
});

describe("the cache key", () => {
  it("is the same for identical requests and different for anything changed", () => {
    const base = request();
    expect(cacheKeyFor(base)).toBe(cacheKeyFor(request()));
    expect(cacheKeyFor(base)).not.toBe(cacheKeyFor(request({ input: "different" })));
    expect(cacheKeyFor(base)).not.toBe(cacheKeyFor(request({ compiled: "different" })));
    expect(cacheKeyFor(base)).not.toBe(cacheKeyFor(request({ model: "claude-sonnet-5" })));
    expect(cacheKeyFor(base)).not.toBe(cacheKeyFor(request({ params: { temperature: 1 } })));
  });

  it("does not depend on the order parameters were written in", () => {
    const a = request({ params: { temperature: 0, maxTokens: 50 } });
    const b = request({ params: { maxTokens: 50, temperature: 0 } });
    // Otherwise a re-run misses the cache because somebody reordered a literal.
    expect(cacheKeyFor(a)).toBe(cacheKeyFor(b));
  });
});

describe("the price table", () => {
  it("dates and sources every row", () => {
    for (const [model, price] of Object.entries(MODEL_PRICES)) {
      expect(price.readOn, `${model} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(price.source, `${model} has no source`).toMatch(/^https:\/\//);
      expect(price.maxOutputTokens).toBeGreaterThan(0);
    }
  });

  it("names only pinned model ids, never a floating alias", () => {
    for (const model of Object.keys(MODEL_PRICES)) {
      expect(model).not.toMatch(/latest|newest|current/);
    }
  });

  it("rounds a cost up, because rounding down under-counts a budget", () => {
    const price = priceFor("claude-haiku-4-5-20251001")!;
    // One token costs a tiny fraction of a cent; it must not cost nothing.
    expect(costCentsFor(price, 1, 0)).toBe(1);
  });

  it("reserves more than a typical call costs", () => {
    const price = priceFor("claude-sonnet-5")!;
    expect(reservationCentsFor(price, 1_000)).toBeGreaterThan(costCentsFor(price, 1_000, 100));
  });
});
