import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { INTEGRATION_IDENTIFIER, TRIAL_DAYS, createCheckoutSession, stripeCustomerFor } from "./checkout";

/**
 * What we actually send to Stripe when somebody buys — asserted on the **parameters**, not on a
 * response.
 *
 * The properties here are ones a mock cannot get wrong on our behalf, because the mock only
 * records: `payment_method_types` is absent, the trial is set, the mode is `subscription`, and the
 * owner rides on both the session and the subscription. Each is a thing Stripe's own reference says
 * an integration gets wrong.
 *
 * **The absence assertion is the one that needs care.** `expect(params).not.toHaveProperty(...)`
 * passes just as happily when the whole call was never made, so the first test proves a call
 * happened and the second proves the parameter is not in it.
 */

interface Recorded {
  readonly sessions: Record<string, unknown>[];
  readonly customers: Record<string, unknown>[];
}

/** A Stripe stand-in that records rather than answers. */
function recorder(): { stripe: Stripe; recorded: Recorded } {
  const recorded: Recorded = { sessions: [], customers: [] };
  const stripe = {
    customers: {
      create: async (params: Record<string, unknown>) => {
        recorded.customers.push(params);
        return { id: "cus_recorded" };
      },
    },
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          recorded.sessions.push(params);
          return { url: "https://checkout.stripe.test/session" };
        },
      },
    },
  } as unknown as Stripe;
  return { stripe, recorded };
}

/**
 * A database stand-in holding one plan, or none, and no billing customer.
 *
 * `plan: null` is how "the row the query asked for is not there" is expressed. The stub cannot read
 * drizzle's `where` clause, so the alternative was a fake that returns the same row whatever it is
 * asked for — which is how the "refuses a plan that does not exist" test passed while proving
 * nothing, on the first run of this file.
 */
function fakeDb(plan: { key: string; stripePriceId: string | null } | null) {
  const rows: Record<string, unknown>[] = [];
  return {
    select: (_columns?: unknown) => ({
      from: (table: { [key: string]: unknown }) => ({
        where: async () => {
          // `plans` carries `monthlyRunLimit`; `billing_customers` does not. That is enough to tell
          // the two reads apart without reaching into drizzle's internals.
          const isPlans = Object.prototype.hasOwnProperty.call(table, "monthlyRunLimit");
          if (isPlans) return plan === null ? [] : [plan];
          return rows;
        },
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            rows.push(value);
            return [{ id: value["stripeCustomerId"] }];
          },
        }),
      }),
    }),
  } as unknown as Parameters<typeof createCheckoutSession>[0];
}

const REQUEST = {
  owner: "user_1",
  email: "someone@example.com",
  planKey: "pro",
  successUrl: "https://app.example.test/app/settings/billing?bought={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://app.example.test/app/settings/billing",
};

describe("the checkout session we ask Stripe for", () => {
  const plan = { key: "pro", stripePriceId: "price_test", monthlyRunLimit: 5000, monthlyCapCents: 5000 };

  it("is created at all, so every assertion below is about a real call", async () => {
    const { stripe, recorded } = recorder();
    const result = await createCheckoutSession(fakeDb(plan), stripe, REQUEST);
    expect(result).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(recorded.sessions).toHaveLength(1);
  });

  /**
   * Stripe's billing reference: *"Never pass `payment_method_types` when creating a subscription
   * Checkout Session … Hardcoding `payment_method_types: ['card']` locks out other payment methods
   * that improve conversion."*
   *
   * An absence nobody asserts is an absence somebody adds back while believing they are being
   * explicit.
   */
  it("does not pass payment_method_types", async () => {
    const { stripe, recorded } = recorder();
    await createCheckoutSession(fakeDb(plan), stripe, REQUEST);
    expect(recorded.sessions[0]).not.toHaveProperty("payment_method_types");
    expect(recorded.sessions[0]).not.toHaveProperty("allowed_payment_method_types");
  });

  it("asks for a subscription, on the plan's price, quantity one", async () => {
    const { stripe, recorded } = recorder();
    await createCheckoutSession(fakeDb(plan), stripe, REQUEST);
    const params = recorded.sessions[0] ?? {};
    expect(params["mode"]).toBe("subscription");
    expect(params["line_items"]).toEqual([{ price: "price_test", quantity: 1 }]);
  });

  it("carries the trial and the integration identifier", async () => {
    const { stripe, recorded } = recorder();
    await createCheckoutSession(fakeDb(plan), stripe, REQUEST);
    const params = recorded.sessions[0] ?? {};
    expect((params["subscription_data"] as { trial_period_days?: number })?.trial_period_days).toBe(TRIAL_DAYS);
    expect(params["integration_identifier"]).toBe(INTEGRATION_IDENTIFIER);
  });

  it("puts the owner on the session and on the subscription", async () => {
    // Both, because the webhook falls back to metadata when the customer is not yet mapped — and a
    // subscription event can arrive before the checkout event that would have mapped it.
    const { stripe, recorded } = recorder();
    await createCheckoutSession(fakeDb(plan), stripe, REQUEST);
    const params = recorded.sessions[0] ?? {};
    expect((params["metadata"] as { owner?: string })?.owner).toBe("user_1");
    expect((params["subscription_data"] as { metadata?: { owner?: string } })?.metadata?.owner).toBe("user_1");
  });

  it("refuses a plan with no price rather than asking Stripe for one", async () => {
    // Team, today. ADR-007 §6 makes it a contact link, so reaching here means a button was rendered
    // that should not have been — and no call should go out.
    const { stripe, recorded } = recorder();
    const teamPlan = { key: "pro", stripePriceId: null, monthlyRunLimit: 5000, monthlyCapCents: 20000 };
    const result = await createCheckoutSession(fakeDb(teamPlan), stripe, REQUEST);
    expect(result).toHaveProperty("why");
    expect(recorded.sessions).toHaveLength(0);
  });

  it("refuses a plan that does not exist", async () => {
    const { stripe, recorded } = recorder();
    const result = await createCheckoutSession(fakeDb(null), stripe, { ...REQUEST, planKey: "nope" });
    expect(result).toHaveProperty("why");
    expect(recorded.sessions).toHaveLength(0);
  });
});

describe("the Stripe customer", () => {
  it("is created with the account's email and its owner in metadata", async () => {
    const { stripe, recorded } = recorder();
    const id = await stripeCustomerFor(fakeDb({ key: "pro", stripePriceId: "price_test" }), stripe, "user_1", "a@example.com");
    expect(id).toBe("cus_recorded");
    expect(recorded.customers[0]).toEqual({ email: "a@example.com", metadata: { owner: "user_1" } });
  });
});

describe("the integration identifier", () => {
  it("ends in eight letters, as Stripe asks", () => {
    expect(INTEGRATION_IDENTIFIER).toMatch(/-[a-z]{8}$/);
  });

  it("is a constant rather than something generated per session", () => {
    // The point is comparing one checkout flow against another in the Dashboard. A fresh suffix on
    // every session would make every session its own flow, which is the opposite of the feature.
    expect(INTEGRATION_IDENTIFIER).toBe(INTEGRATION_IDENTIFIER);
    expect(INTEGRATION_IDENTIFIER.length).toBeGreaterThan(8);
  });
});
