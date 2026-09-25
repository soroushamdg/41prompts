import { billingCustomers, plans, type Db } from "@41prompts/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

/**
 * Starting a subscription, and managing one afterwards.
 *
 * ## Checkout, not a hand-built payment form
 *
 * Stripe's own routing for recurring revenue is Billing APIs plus Checkout Sessions in
 * `mode: "subscription"`, which handles the first payment, the trial and proration. A PaymentIntent
 * integration with a renewal loop of our own is the thing that guidance exists to steer people away
 * from — Billing already does retry and dunning, and rebuilding it would be rebuilding the part
 * most likely to go wrong with somebody's money.
 *
 * ## `payment_method_types` is deliberately absent
 *
 * Stripe's billing reference is emphatic: *"Never pass `payment_method_types` when creating a
 * subscription Checkout Session. Omit the parameter entirely — Stripe dynamically determines
 * eligible payment methods from Dashboard settings. Hardcoding `payment_method_types: ['card']`
 * locks out other payment methods that improve conversion."*
 *
 * It is worth stating as an *absence* because an absence is invisible in review: somebody adding
 * `['card']` later would be making the integration worse while appearing to make it more explicit.
 * `checkout.test.ts` asserts the parameter is not in what we send.
 *
 * ## Managed Payments is off, and that is a decision rather than a workaround
 *
 * **Found by the browser drive, not by a test.** The first real checkout this project ever opened
 * came back `400`: *"the product tax code is missing … Product tax code is required for Managed
 * Payments, which is enabled by default on your account."* Stripe turns Managed Payments on for new
 * accounts, and under it **Stripe is the merchant of record** — it sells to the customer, it
 * charges and remits the tax, and the money reaches us as a payout from Stripe rather than as a
 * charge we made.
 *
 * That is a change to who is selling, not a checkout parameter, and it is outside this epic twice
 * over: `docs/epics/EPIC-070-stripe-and-pricing.md` puts tax beyond Stripe Tax out of scope, and
 * `docs/decisions/AUTONOMOUS.md` (2026-09-24) records Soroush's decision that **no tax is
 * collected** because he is not registered anywhere. Adding a `tax_code` to the Product would have
 * made the error go away and opted us into all of it silently, which is the worse of the two
 * failures available here.
 *
 * So the session says `managed_payments: { enabled: false }`, which is exactly the behaviour every
 * document about this epic already describes: we are the merchant, and no tax is collected. Turning
 * it **on** is a real option and possibly a good one — it is the usual answer to selling digital
 * services worldwide without registering anywhere — but it is Soroush's decision with an
 * accountant, and it is in the report as one.
 *
 * It is set per session rather than in the Dashboard so that the behaviour lives in this repository
 * and survives a Dashboard nobody remembers configuring. `stripe@22`'s types do not carry the
 * parameter yet, so it is spread in through a cast; the API accepts it and names it in the error
 * text quoted above.
 *
 * ## The customer is created once and reused
 *
 * A second Stripe customer for the same account means a subscription the ownership lookup cannot
 * resolve, because `billing_customers` maps one customer id to one owner. So the row is the lock:
 * created on the first checkout or portal visit, read every time after.
 */

/**
 * Tags every session this integration creates, for grouping in the Dashboard.
 *
 * Stripe asks for a label with a suffix of eight random letters on API versions from
 * `2026-03-25.dahlia`; the SDK pins `2026-08-26.dahlia`, so it applies. **It is a constant rather
 * than generated per session** — the point is to compare one checkout flow against another, and a
 * fresh suffix on every session would make every session its own flow.
 */
export const INTEGRATION_IDENTIFIER = "41p-subscription-qkzrmvbd";

/** A trial, as the mockup promises. `trialing` grants the plan — `billing.ts`'s `GRANTING_STATUSES`. */
export const TRIAL_DAYS = 14;

/**
 * The Stripe customer for an account, created on first use.
 *
 * `email` is passed so an invoice and a receipt carry an address a person recognises. It is not
 * kept in step afterwards: Stripe's copy is what the customer sees on a receipt and ours is what
 * they sign in with, and quietly overwriting one from the other on every visit would be a write
 * nobody asked for.
 */
export async function stripeCustomerFor(
  db: Db,
  stripe: Stripe,
  owner: string,
  email: string
): Promise<string> {
  const [existing] = await db
    .select({ id: billingCustomers.stripeCustomerId })
    .from(billingCustomers)
    .where(eq(billingCustomers.owner, owner));
  if (existing) return existing.id;

  const customer = await stripe.customers.create({ email, metadata: { owner } });

  // `onConflictDoNothing` plus a re-read, so two tabs opening checkout at once cannot write two
  // rows — the same race `getOrCreateRunBudget` handles the same way.
  const inserted = await db
    .insert(billingCustomers)
    .values({ owner, stripeCustomerId: customer.id })
    .onConflictDoNothing({ target: billingCustomers.owner })
    .returning({ id: billingCustomers.stripeCustomerId });
  if (inserted[0]) return inserted[0].id;

  const [raced] = await db
    .select({ id: billingCustomers.stripeCustomerId })
    .from(billingCustomers)
    .where(eq(billingCustomers.owner, owner));
  if (!raced) throw new Error(`billing customer for ${owner} missing after insert race`);
  return raced.id;
}

export interface CheckoutRequest {
  readonly owner: string;
  readonly email: string;
  readonly planKey: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

/**
 * A Checkout Session for a plan, or a sentence saying why there is not one.
 *
 * Returns a reason rather than throwing, for the same rule the webhook follows: a plan with no
 * price is a configuration state somebody can fix, not an exception worth a 500 on a settings page.
 */
export async function createCheckoutSession(
  db: Db,
  stripe: Stripe,
  request: CheckoutRequest
): Promise<{ url: string } | { why: string }> {
  const [plan] = await db.select().from(plans).where(eq(plans.key, request.planKey));
  if (!plan) return { why: `There is no ${request.planKey} plan.` };
  if (plan.stripePriceId === null) {
    // Team, today. ADR-007 §6 makes it a contact link rather than a checkout, so arriving here
    // means a button was rendered that should not have been.
    return { why: `The ${request.planKey} plan is not something you can buy here.` };
  }

  const customer = await stripeCustomerFor(db, stripe, request.owner, request.email);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    // **`owner` on both the session and the subscription.** The webhook resolves ownership through
    // the customer first and falls back to metadata; putting it on the subscription too means the
    // fallback works for a subscription event that arrives before the checkout event, which Stripe
    // does sometimes deliver out of order.
    metadata: { owner: request.owner },
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { owner: request.owner },
    },
    integration_identifier: INTEGRATION_IDENTIFIER,
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    // No `payment_method_types` — see the note at the top of this file. It is an absence on purpose.
    //
    // **Managed Payments is turned off, per session.** See the block below; it is not in the typed
    // parameters of `stripe@22`, and the cast is what that costs.
    ...({ managed_payments: { enabled: false } } as object),
  });

  if (session.url === null) return { why: "Stripe did not return a checkout URL." };
  return { url: session.url };
}

/**
 * The customer portal — where a subscription is changed or cancelled.
 *
 * Stripe's recommendation for self-service management, and the reason to prefer it over building
 * upgrade, downgrade, cancellation and payment-method screens is that those are the flows where
 * proration, trials and period boundaries all interact. The portal already gets that right.
 *
 * An account that has never paid has no customer, so this creates one rather than refusing: a
 * person clicking "manage billing" with nothing to manage should reach a page that says so, not an
 * error.
 */
export async function createPortalSession(
  db: Db,
  stripe: Stripe,
  owner: string,
  email: string,
  returnUrl: string
): Promise<{ url: string } | { why: string }> {
  const customer = await stripeCustomerFor(db, stripe, owner, email);
  try {
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: returnUrl });
    return { url: session.url };
  } catch (error) {
    // The portal needs its settings saved once in the Dashboard before it will open. That is a
    // configuration step rather than a fault, and saying so beats a stack trace on a settings page.
    const message = (error as { message?: string }).message ?? "unknown";
    return { why: `The billing portal is not configured yet. Stripe said: ${message}` };
  }
}
