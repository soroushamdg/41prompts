import { billingCustomers, plans, type Db } from "@41prompts/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { managedPaymentsEnabled } from "./stripe";

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
 * ## Managed Payments is **on**: Stripe is the merchant of record (ADR-008)
 *
 * **EPIC-070 shipped this as `enabled: false` and EPIC-074 reversed it**, which is worth reading as
 * one decision rather than as a change of mind. EPIC-070's first real checkout came back `400` —
 * *"the product tax code is missing … Product tax code is required for Managed Payments, which is
 * enabled by default on your account"* — and it turned the feature off rather than clearing the
 * error with a tax code, because clearing it would have opted us into a merchant-of-record
 * arrangement **silently**. Soroush then made the decision explicitly on 2026-09-25, which is what
 * ADR-008 records and what this line implements.
 *
 * Under it, **Stripe sells to the customer**: it calculates, collects, registers, files and remits
 * sales tax, VAT and GST in 80+ countries, issues tax invoices, and takes fraud, disputes and
 * transaction-level support. The alternative was never "do it ourselves" — no registration exists
 * anywhere, so it was "no compliance", which is a liability rather than a saving.
 *
 * **It is set per session rather than in the Dashboard** so the behaviour lives in this repository
 * and survives a Dashboard nobody remembers configuring, and it is read from
 * `managedPaymentsEnabled()` rather than hardcoded because eligibility belongs to the Stripe
 * account and not to this code (ADR-008 §5).
 *
 * `stripe@22`'s types do not carry the parameter yet, so it is spread in through a cast; the API
 * accepts it and names it in the error text quoted above.
 *
 * ## What this file must **not** grow
 *
 * Stripe says Managed Payments *"automatically manages certain parameters related to Connect, tax
 * configuration, and shipping"* and that those cannot be set by hand. `automatic_tax`,
 * `tax_id_collection`, `shipping_address_collection` and anything Connect-shaped therefore belong
 * to Stripe here. None is set below, and `checkout.test.ts` asserts their absence so that adding
 * one later is a failing test rather than a 400 in front of a customer.
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
    // **Managed Payments**, per session — see the block at the top of this file. Not in the typed
    // parameters of `stripe@22`, and the cast is what that costs.
    ...({ managed_payments: { enabled: managedPaymentsEnabled() } } as object),
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
