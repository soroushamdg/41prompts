import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { user } from "@/db/schema";
import { makeUser, testDb } from "@/test/db";
import { handleStripeEvent, planFromStatus } from "./billing";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => ({ db, close } = await testDb()));
afterAll(() => close());

const ev = (id: string, type: string, object: object) => ({ id, type, data: { object } }) as unknown as Stripe.Event;

describe("planFromStatus", () => {
  it("keeps Performance through the failed-payment grace period only", () => {
    expect(["active", "trialing", "past_due"].map(planFromStatus)).toEqual(["performance", "performance", "performance"]);
    expect(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused", null].map(planFromStatus)).toEqual(Array(6).fill("free"));
  });
});

describe("webhooks", () => {
  it("sets the plan from the subscription's current state, idempotently and in any order", async () => {
    const u = await makeUser(db, { stripeCustomerId: "cus_1" });
    let status = "active";
    const deps = { retrieveSubscription: async (id: string) => ({ id, status, customer: "cus_1", items: { data: [{ current_period_end: 1_900_000_000 }] } }) };

    expect(await handleStripeEvent(db, ev("evt_1", "checkout.session.completed", { subscription: "sub_1" }), deps)).toBe("applied");
    let [row] = await db.select().from(user).where(eq(user.id, u));
    expect(row).toMatchObject({ plan: "performance", subscriptionStatus: "active", stripeSubscriptionId: "sub_1" });

    expect(await handleStripeEvent(db, ev("evt_1", "checkout.session.completed", { subscription: "sub_1" }), deps)).toBe("duplicate");

    // A stale "updated" event arrives after cancellation: the current state wins.
    status = "canceled";
    await handleStripeEvent(db, ev("evt_3", "customer.subscription.deleted", { id: "sub_1" }), deps);
    await handleStripeEvent(db, ev("evt_2", "customer.subscription.updated", { id: "sub_1", status: "active" }), deps);
    [row] = await db.select().from(user).where(eq(user.id, u));
    expect(row?.plan).toBe("free");
  });

  it("keeps Performance while a payment is being retried, and ignores unknown customers", async () => {
    const u = await makeUser(db, { stripeCustomerId: "cus_2" });
    const deps = { retrieveSubscription: async (id: string) => ({ id, status: "past_due", customer: "cus_2" }) };
    await handleStripeEvent(db, ev("evt_10", "invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_2" } } }), deps);
    expect((await db.select().from(user).where(eq(user.id, u)))[0]?.plan).toBe("performance");
    const ghost = { retrieveSubscription: async (id: string) => ({ id, status: "active", customer: "cus_gone" }) };
    expect(await handleStripeEvent(db, ev("evt_11", "customer.subscription.updated", { id: "sub_x" }), ghost)).toBe("ignored");
  });

  it("drops billing state when Stripe deletes the customer", async () => {
    const u = await makeUser(db, { stripeCustomerId: "cus_3", plan: "performance", subscriptionStatus: "active" });
    await handleStripeEvent(db, ev("evt_20", "customer.deleted", { id: "cus_3" }), { retrieveSubscription: async () => { throw new Error("unused"); } });
    expect((await db.select().from(user).where(eq(user.id, u)))[0]).toMatchObject({ plan: "free", stripeCustomerId: null });
  });
});
