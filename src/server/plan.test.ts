import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { user } from "@/db/schema";
import { makeUser, testDb } from "@/test/db";

import { hasInterest, recordInterest } from "./interest";
import { PerformanceRequired, planFor, requirePerformance } from "./plan";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await testDb()));
afterAll(() => close());

describe("plan enforcement", () => {
  it("defaults to Free and refuses Performance capabilities", async () => {
    const id = await makeUser(db);
    expect(await planFor(db, id)).toBe("free");
    await expect(requirePerformance(db, id)).rejects.toBeInstanceOf(PerformanceRequired);
  });

  it("allows Performance once the plan says so", async () => {
    const id = await makeUser(db);
    await db.update(user).set({ plan: "performance" }).where(eq(user.id, id));
    await expect(requirePerformance(db, id)).resolves.toBeUndefined();
  });
});

describe("performance interest", () => {
  it("records one row per user, idempotently", async () => {
    const id = await makeUser(db);
    expect(await hasInterest(db, id)).toBe(false);
    await recordInterest(db, id, "The linter");
    await recordInterest(db, id, "Tests");
    expect(await hasInterest(db, id)).toBe(true);
  });
});
