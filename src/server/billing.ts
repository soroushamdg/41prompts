import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import Stripe from "stripe";
import type { Db } from "@/db";
import { stripeEvents, user } from "@/db/schema";
import { requireEnv } from "@/lib/env";
import { appUrl } from "@/lib/hosts";
import type { Plan } from "@/lib/plans";

/* Stripe billing (B01) with Managed Payments: Stripe is the merchant of
   record, Checkout and the Billing Portal are hosted pages, and webhooks are
   the only thing that sets `plan`. Customers can also manage a subscription
   on link.com, so every event re-reads the subscription instead of trusting
   the event's order. */

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!client) client = new Stripe(requireEnv("STRIPE_SECRET_KEY"), { maxNetworkRetries: 2, appInfo: { name: "41prompts" } });
  return client;
}

/** Performance while paid, trialing, or inside the failed-payment grace period. */
export function planFromStatus(status: string | null | undefined): Plan {
  return status === "active" || status === "trialing" || status === "past_due" ? "performance" : "free";
}

let priceCache: { label: string; at: number } | null = null;
/** "$12" from the configured Stripe price, cached for ten minutes. */
export async function priceLabel(): Promise<string | null> {
  if (priceCache && Date.now() - priceCache.at < 600_000) return priceCache.label;
  try {
    const price = await stripe().prices.retrieve(requireEnv("STRIPE_PRICE_ID"));
    if (price.unit_amount === null) return null;
    const label = new Intl.NumberFormat("en-US", { style: "currency", currency: price.currency.toUpperCase(), minimumFractionDigits: price.unit_amount % 100 ? 2 : 0 }).format(price.unit_amount / 100);
    priceCache = { label, at: Date.now() };
    return label;
  } catch {
    return null;
  }
}

type Viewer = { id: string; email: string; name: string };

async function customerFor(db: Db, viewer: Viewer): Promise<string> {
  const [row] = await db.select({ customer: user.stripeCustomerId }).from(user).where(eq(user.id, viewer.id));
  if (row?.customer) return row.customer;
  const customer = await stripe().customers.create({ email: viewer.email, name: viewer.name || undefined, metadata: { userId: viewer.id } }, { idempotencyKey: `customer-${viewer.id}` });
  const set = await db.update(user).set({ stripeCustomerId: customer.id }).where(and(eq(user.id, viewer.id), isNull(user.stripeCustomerId))).returning({ id: user.id });
  if (set.length) return customer.id;
  const [again] = await db.select({ customer: user.stripeCustomerId }).from(user).where(eq(user.id, viewer.id));
  return again!.customer!;
}

/** A Checkout URL, or the Billing Portal for someone who already subscribes. */
export async function checkoutUrl(db: Db, viewer: Viewer): Promise<string> {
  const [row] = await db.select({ status: user.subscriptionStatus }).from(user).where(eq(user.id, viewer.id));
  if (planFromStatus(row?.status) === "performance") return portalUrl(db, viewer.id);
  const customer = await customerFor(db, viewer);
  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer,
      client_reference_id: viewer.id,
      line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
      managed_payments: { enabled: true },
      subscription_data: { metadata: { userId: viewer.id } },
      metadata: { userId: viewer.id },
      success_url: appUrl("/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}#billing"),
      cancel_url: appUrl("/settings?checkout=cancel#billing"),
    },
    { idempotencyKey: `checkout-${viewer.id}-${Math.floor(Date.now() / 60_000)}` },
  );
  if (!session.url) throw new Error("Stripe returned no Checkout URL.");
  return session.url;
}

export async function portalUrl(db: Db, userId: string): Promise<string> {
  const [row] = await db.select({ customer: user.stripeCustomerId }).from(user).where(eq(user.id, userId));
  if (!row?.customer) throw new Error("No Stripe customer yet.");
  const portal = await stripe().billingPortal.sessions.create({ customer: row.customer, return_url: appUrl("/settings#billing") });
  return portal.url;
}

type SubscriptionLike = { id: string; status: string; customer: string | { id: string }; metadata?: Record<string, string> | null; items?: { data: Array<{ current_period_end?: number }> } };

/** Writes a subscription's current state onto its user. Unknown users are ignored. */
export async function applySubscription(db: Db, sub: SubscriptionLike): Promise<boolean> {
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const end = sub.items?.data[0]?.current_period_end;
  const values = {
    plan: planFromStatus(sub.status),
    subscriptionStatus: sub.status,
    stripeSubscriptionId: sub.id,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  };
  const byCustomer = await db.update(user).set(values).where(eq(user.stripeCustomerId, customer)).returning({ id: user.id });
  if (byCustomer.length) return true;
  const userId = sub.metadata?.userId;
  if (!userId) return false;
  const byId = await db.update(user).set({ ...values, stripeCustomerId: customer }).where(eq(user.id, userId)).returning({ id: user.id });
  return byId.length > 0;
}

type Deps = { retrieveSubscription: (id: string) => Promise<SubscriptionLike> };

function subscriptionIdOf(event: Stripe.Event): string | null {
  const o = event.data.object as unknown as Record<string, unknown>;
  if (event.type.startsWith("customer.subscription.")) return o.id as string;
  if (event.type === "checkout.session.completed") return (o.subscription as string) ?? null;
  if (event.type.startsWith("invoice.")) {
    const parent = o.parent as { subscription_details?: { subscription?: string } } | undefined;
    return parent?.subscription_details?.subscription ?? (o.subscription as string) ?? null;
  }
  return null;
}

/** Idempotent webhook handling. Returns what happened, for logs and tests. */
export async function handleStripeEvent(db: Db, event: Stripe.Event, deps: Deps): Promise<"duplicate" | "applied" | "ignored"> {
  const [seen] = await db.select({ id: stripeEvents.id }).from(stripeEvents).where(eq(stripeEvents.id, event.id));
  if (seen) return "duplicate";
  let result: "applied" | "ignored" = "ignored";
  if (event.type === "customer.deleted") {
    const customer = (event.data.object as { id: string }).id;
    await db.update(user).set({ plan: "free", stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: null, currentPeriodEnd: null }).where(eq(user.stripeCustomerId, customer));
    result = "applied";
  } else {
    const subId = subscriptionIdOf(event);
    if (subId) {
      // Always the subscription's current state, whatever order events arrive in.
      const sub = await deps.retrieveSubscription(subId);
      result = (await applySubscription(db, sub)) ? "applied" : "ignored";
    }
  }
  await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return result;
}

export const liveDeps: Deps = { retrieveSubscription: (id) => stripe().subscriptions.retrieve(id) as unknown as Promise<SubscriptionLike> };

/** After Checkout, sync at once instead of waiting for the webhook. */
export async function syncCheckoutSession(db: Db, userId: string, sessionId: string): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== userId || typeof session.subscription !== "string") return;
  await applySubscription(db, await liveDeps.retrieveSubscription(session.subscription));
}

/** On account deletion: end the subscription now so nobody is billed again. */
export async function cancelSubscriptionFor(db: Db, userId: string): Promise<void> {
  const [row] = await db.select({ sub: user.stripeSubscriptionId, status: user.subscriptionStatus }).from(user).where(eq(user.id, userId));
  if (!row?.sub || row.status === "canceled" || !process.env.STRIPE_SECRET_KEY) return;
  await stripe().subscriptions.cancel(row.sub);
}
