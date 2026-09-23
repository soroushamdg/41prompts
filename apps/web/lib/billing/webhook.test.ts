import { createDb, plans, stripeEvents, subscriptions, users, type Db } from "@41prompts/db";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "@41prompts/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HANDLED_EVENT_TYPES,
  isHandledType,
  recordEvent,
  subscriptionFactsFrom,
  subscriptionIdOnInvoice,
  upsertSubscription,
} from "./webhook";

/**
 * **The idempotency test, written before the handler that serves it** — the epic's Notes say so,
 * and the reason is that a money bug found after the fact has already charged somebody twice.
 *
 * The property is *"a webhook delivered twice has the effect of one"*. It is proved here against a
 * real database, because the mechanism being tested **is** the database's primary-key constraint —
 * a mocked store would be testing the mock's idea of a conflict.
 *
 * Nothing here reaches Stripe. Event delivery and signing are separate concerns and neither needs
 * an account: signing is HMAC over a body with a shared secret, and the ledger is ours.
 */

const TEST_PLAN = "webhook-test-plan";
const TEST_PRICE = "price_webhook_test";

function testUserId(suffix: string): string {
  return `webhook-test-user-${suffix}`;
}

/** The shape Stripe sends, with only the fields the reader looks at. */
function stripeSubscription(over: Partial<Record<string, unknown>> = {}): Stripe.Subscription {
  const startSeconds = Math.floor(Date.UTC(2026, 8, 1) / 1000);
  const endSeconds = Math.floor(Date.UTC(2026, 9, 1) / 1000);
  return {
    id: "sub_test_webhook",
    customer: "cus_test_webhook",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { id: TEST_PRICE },
          current_period_start: startSeconds,
          current_period_end: endSeconds,
        },
      ],
    },
    ...over,
  } as unknown as Stripe.Subscription;
}

const planForPrice = (priceId: string): string | undefined => (priceId === TEST_PRICE ? TEST_PLAN : undefined);

describe("which event types are acted on", () => {
  it("has types to act on, so the assertions below are not vacuous", () => {
    expect(HANDLED_EVENT_TYPES.length).toBeGreaterThan(2);
  });

  it.each([...HANDLED_EVENT_TYPES])("%s is handled", (type) => {
    expect(isHandledType(type)).toBe(true);
  });

  it.each(["customer.subscription.trial_will_end", "charge.refunded", "some.type.stripe.has.not.invented.yet"])(
    "%s is not handled, and that is a recorded fact rather than a silent drop",
    (type) => {
      expect(isHandledType(type)).toBe(false);
    }
  );

  /**
   * The four Stripe's billing reference says an integration is not complete without, named one at
   * a time rather than counted.
   *
   * *"Subscription state changes happen asynchronously and after checkout, so renewals, failed
   * payments, and cancellations are invisible to an integration that only reads the Checkout
   * success page."* The first version of this file handled neither invoice event and neither
   * asynchronous settlement.
   */
  it.each([
    ["a renewal", "invoice.paid"],
    ["a failed charge, which is also the dunning trigger", "invoice.payment_failed"],
    ["a cancellation", "customer.subscription.deleted"],
    ["an asynchronous method settling after checkout", "checkout.session.async_payment_succeeded"],
  ])("handles %s", (_what, type) => {
    expect(isHandledType(type)).toBe(true);
  });
});

describe("finding the subscription an invoice belongs to", () => {
  /**
   * Stripe moved this field in the 2025-03-31 API version, the same reshaping that moved the
   * period onto the subscription item. Both shapes are read, because a deployment pinned to either
   * must not silently conclude "no subscription" and ignore a renewal.
   */
  it("reads the newer nested shape", () => {
    const invoice = { parent: { subscription_details: { subscription: "sub_nested" } } } as unknown as Parameters<
      typeof subscriptionIdOnInvoice
    >[0];
    expect(subscriptionIdOnInvoice(invoice)).toBe("sub_nested");
  });

  it("reads the older top-level shape", () => {
    const invoice = { subscription: "sub_top" } as unknown as Parameters<typeof subscriptionIdOnInvoice>[0];
    expect(subscriptionIdOnInvoice(invoice)).toBe("sub_top");
  });

  it("reads an expanded object in either place", () => {
    const top = { subscription: { id: "sub_expanded" } } as unknown as Parameters<typeof subscriptionIdOnInvoice>[0];
    expect(subscriptionIdOnInvoice(top)).toBe("sub_expanded");
    const nested = {
      parent: { subscription_details: { subscription: { id: "sub_expanded_nested" } } },
    } as unknown as Parameters<typeof subscriptionIdOnInvoice>[0];
    expect(subscriptionIdOnInvoice(nested)).toBe("sub_expanded_nested");
  });

  it("says nothing rather than guessing when an invoice has no subscription", () => {
    // A one-off invoice is a real thing and is not a renewal. Returning undefined is what stops
    // the handler retrieving `undefined` from Stripe and erroring on a perfectly normal event.
    const invoice = { id: "in_oneoff" } as unknown as Parameters<typeof subscriptionIdOnInvoice>[0];
    expect(subscriptionIdOnInvoice(invoice)).toBeUndefined();
  });
});

describe("reading a Stripe subscription into our shape", () => {
  it("reads id, customer, plan, status, period and the cancel flag", () => {
    const facts = subscriptionFactsFrom(stripeSubscription(), "user-1", planForPrice);
    expect(typeof facts).not.toBe("string");
    if (typeof facts === "string") return;
    expect(facts.id).toBe("sub_test_webhook");
    expect(facts.stripeCustomerId).toBe("cus_test_webhook");
    expect(facts.planKey).toBe(TEST_PLAN);
    expect(facts.status).toBe("active");
    expect(facts.cancelAtPeriodEnd).toBe(false);
  });

  /**
   * The unit bug that would downgrade every paying customer at once.
   *
   * Stripe sends seconds. Treating them as milliseconds puts the period in January 1970, which the
   * plan read — bounded by `currentPeriodEnd` against the clock — correctly calls expired. It would
   * look exactly like everybody's subscription lapsing simultaneously, for no reason.
   */
  it("converts seconds to milliseconds, so the period is not in 1970", () => {
    const facts = subscriptionFactsFrom(stripeSubscription(), "user-1", planForPrice);
    if (typeof facts === "string") throw new Error(facts);
    expect(facts.currentPeriodStart.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(facts.currentPeriodEnd.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(facts.currentPeriodStart.getUTCFullYear()).toBe(2026);
  });

  /**
   * Stripe moved the period onto the subscription **item** in API version 2025-03-31.
   *
   * Both shapes are read, so a deployment pinned to either version gets a real period rather than
   * the 1970 one above. This is the older shape.
   */
  it("reads the period from the subscription when the item does not carry one", () => {
    const older = stripeSubscription({
      items: { data: [{ price: { id: TEST_PRICE } }] },
      current_period_start: Math.floor(Date.UTC(2026, 0, 1) / 1000),
      current_period_end: Math.floor(Date.UTC(2026, 1, 1) / 1000),
    });
    const facts = subscriptionFactsFrom(older, "user-1", planForPrice);
    if (typeof facts === "string") throw new Error(facts);
    expect(facts.currentPeriodStart.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("takes the customer id whether Stripe expanded the object or not", () => {
    const expanded = stripeSubscription({ customer: { id: "cus_expanded" } });
    const facts = subscriptionFactsFrom(expanded, "user-1", planForPrice);
    if (typeof facts === "string") throw new Error(facts);
    expect(facts.stripeCustomerId).toBe("cus_expanded");
  });

  it.each([
    ["no owner on the metadata", undefined, stripeSubscription(), /no owner/],
    ["an empty owner", "", stripeSubscription(), /no owner/],
    ["no price", "user-1", stripeSubscription({ items: { data: [{}] } }), /no price/],
    [
      "a price nothing maps",
      "user-1",
      stripeSubscription({ items: { data: [{ price: { id: "price_unknown" } }] } }),
      /no plan is configured/,
    ],
    [
      "no period anywhere",
      "user-1",
      stripeSubscription({ items: { data: [{ price: { id: TEST_PRICE } }] } }),
      /no current period/,
    ],
  ])("says why it cannot read %s, rather than throwing", (_what, owner, subscription, expected) => {
    // A malformed event must not throw: throwing means a non-2xx, and a non-2xx tells Stripe to
    // redeliver something that will fail identically for ever.
    const result = subscriptionFactsFrom(subscription as Stripe.Subscription, owner as string | undefined, planForPrice);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(expected);
  });
});

announceDatabaseSkip("stripe webhook idempotency");

describe.skipIf(!HAS_TEST_DATABASE)("stripe webhook idempotency", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db
      .insert(plans)
      .values({ key: TEST_PLAN, stripePriceId: TEST_PRICE, monthlyRunLimit: 100, monthlyCapCents: 1000 })
      .onConflictDoNothing({ target: plans.key });
  });

  afterAll(async () => {
    await db.delete(plans).where(eq(plans.key, TEST_PLAN));
  });

  async function makeUser(id: string): Promise<void> {
    await db
      .insert(users)
      .values({ id, name: "Webhook test", email: `${id}@example.com`, emailVerified: true })
      .onConflictDoNothing({ target: users.id });
  }

  async function cleanup(id: string, eventIds: string[]): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
    for (const eventId of eventIds) await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
  }

  it("claims an event id once", async () => {
    const eventId = "evt_claim_once";
    try {
      expect(await recordEvent(db, eventId, "customer.subscription.updated")).toBe("first");
      expect(await recordEvent(db, eventId, "customer.subscription.updated")).toBe("repeat");
    } finally {
      await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
    }
  });

  /**
   * **The criterion: a webhook delivered twice has the effect of one.**
   *
   * The second delivery is the same event id carrying the same subscription. One row, one period —
   * and the period is asserted, not just the row count, because "one row that has been advanced a
   * month" is the shape of the bug this exists to prevent.
   */
  it("a redelivered event leaves one subscription row and one period", async () => {
    const owner = testUserId("resend");
    const eventId = "evt_resend";
    await makeUser(owner);
    try {
      const subscription = stripeSubscription();

      for (const delivery of [1, 2]) {
        const outcome = await recordEvent(db, eventId, "customer.subscription.updated");
        expect(outcome).toBe(delivery === 1 ? "first" : "repeat");
        if (outcome !== "first") continue;
        const facts = subscriptionFactsFrom(subscription, owner, planForPrice);
        if (typeof facts === "string") throw new Error(facts);
        await upsertSubscription(db, facts);
      }

      const rows = await db.select().from(subscriptions).where(eq(subscriptions.owner, owner));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.currentPeriodEnd.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    } finally {
      await cleanup(owner, [eventId]);
    }
  });

  /**
   * The positive control on the test above.
   *
   * It asserts "one row after two deliveries", which would also pass if the writer were broken and
   * wrote nothing at all. This proves a **different** event id does reach the database — so the
   * ledger is what stopped the second delivery, not a writer that never worked.
   */
  it("a different event id does write, so the ledger is what stopped the replay", async () => {
    const owner = testUserId("control");
    const first = "evt_control_one";
    const second = "evt_control_two";
    await makeUser(owner);
    try {
      expect(await recordEvent(db, first, "customer.subscription.updated")).toBe("first");
      const created = subscriptionFactsFrom(stripeSubscription(), owner, planForPrice);
      if (typeof created === "string") throw new Error(created);
      await upsertSubscription(db, created);

      expect(await recordEvent(db, second, "customer.subscription.updated")).toBe("first");
      const cancelled = subscriptionFactsFrom(
        stripeSubscription({ cancel_at_period_end: true, status: "active" }),
        owner,
        planForPrice
      );
      if (typeof cancelled === "string") throw new Error(cancelled);
      await upsertSubscription(db, cancelled);

      const rows = await db.select().from(subscriptions).where(eq(subscriptions.owner, owner));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.cancelAtPeriodEnd).toBe(true);
    } finally {
      await cleanup(owner, [first, second]);
    }
  });

  it("two concurrent deliveries of one event claim it exactly once", async () => {
    // The window a `SELECT` then `INSERT` would leave open, and the reason the claim is one
    // statement. A timeout-then-retry produces exactly this: two deliveries in flight at once.
    const eventId = "evt_concurrent";
    try {
      const outcomes = await Promise.all(
        Array.from({ length: 8 }, () => recordEvent(db, eventId, "customer.subscription.updated"))
      );
      expect(outcomes.filter((outcome) => outcome === "first")).toHaveLength(1);
    } finally {
      await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
    }
  });

  it("records an unknown type with handled false, rather than dropping it", async () => {
    const eventId = "evt_unknown_type";
    try {
      expect(await recordEvent(db, eventId, "some.type.stripe.has.not.invented.yet")).toBe("first");
      const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, eventId));
      expect(row?.handled).toBe(false);
      expect(row?.type).toBe("some.type.stripe.has.not.invented.yet");
    } finally {
      await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
    }
  });

  it("records a known type with handled true, so the column means something", async () => {
    const eventId = "evt_known_type";
    try {
      await recordEvent(db, eventId, "customer.subscription.updated");
      const [row] = await db.select().from(stripeEvents).where(eq(stripeEvents.id, eventId));
      expect(row?.handled).toBe(true);
    } finally {
      await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
    }
  });
});
