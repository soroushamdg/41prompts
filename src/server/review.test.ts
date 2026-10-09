import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { mayAskForReview } from "@/lib/product-hunt";
import { makeUser, testDb } from "@/test/db";
import { getReviewState, recordReviewAsked, setReviewStatus } from "./review";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await testDb()));
afterAll(() => close());

const old = new Date("2026-01-01T00:00:00Z");

describe("review prompt state", () => {
  it("starts open, counts asks, snoozes for two weeks, and remembers never", async () => {
    const u = await makeUser(db);
    expect(await getReviewState(db, u, old)).toMatchObject({ status: "open", askCount: 0 });
    await recordReviewAsked(db, u, "run_completed");
    await recordReviewAsked(db, u, "fifth_copy");
    let s = await getReviewState(db, u, old);
    expect(s.askCount).toBe(2);
    expect(mayAskForReview(s)).toBe(false); // just asked
    await setReviewStatus(db, u, "snoozed");
    s = await getReviewState(db, u, old);
    expect(new Date(s.snoozedUntil!).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    await setReviewStatus(db, u, "never");
    s = await getReviewState(db, u, old);
    expect(s.status).toBe("never");
    expect(mayAskForReview(s, new Date("2030-01-01"))).toBe(false);
  });
});
