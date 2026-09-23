import { billingCustomers, plans } from "@41prompts/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { createLogger, withRequestId } from "@41prompts/logger";
import { getDb } from "@/lib/db";
import { stripeOrUndefined, webhookSecret } from "@/lib/billing/stripe";
import { recordEvent, subscriptionFactsFrom, subscriptionIdOnInvoice, upsertSubscription } from "@/lib/billing/webhook";

/**
 * Stripe's webhook endpoint.
 *
 * ## Why every failure here answers 200
 *
 * A non-2xx tells Stripe to redeliver. That is right for *"we could not reach the database"* and
 * wrong for everything else: an event we cannot read, an event for a price nothing maps, an event
 * type we do not handle. Redelivering those produces the identical failure for three days and
 * buries the one real retry in the noise.
 *
 * So the rule is: **200 with a reason, unless the work itself failed.** The reason goes in the log
 * and the receipt goes in `stripe_events`, which is what makes "did we see it, and did we act"
 * answerable afterwards.
 *
 * The one deliberate non-2xx is a **bad signature**, which is 400. That is not a delivery problem —
 * it is either a misconfigured secret or somebody posting to this route, and neither is fixed by
 * retrying.
 *
 * ## The raw body, not the parsed one
 *
 * `constructEvent` verifies an HMAC over the **exact bytes** Stripe sent. Parsing and re-serialising
 * changes key order and whitespace and the signature then never matches, which looks like a wrong
 * secret and is not. `request.text()` is what keeps the bytes.
 */
export const dynamic = "force-dynamic";

/** Nothing here is cached, and the route must not be pre-rendered at build time. */
export const runtime = "nodejs";

const log = createLogger("web");

export async function POST(request: Request): Promise<Response> {
  return withRequestId(async () => handle(request));
}

async function handle(request: Request): Promise<Response> {
  const stripe = stripeOrUndefined();
  const secret = webhookSecret();

  if (stripe === undefined || secret === undefined) {
    // Billing is not configured on this deployment. Answering 200 is deliberate: a redelivery
    // cannot make a key appear, and this is a supported state rather than a fault.
    log.warn("stripe webhook received but billing is not configured on this deployment");
    return Response.json({ received: true, acted: false, why: "billing is not configured" });
  }

  const signature = request.headers.get("stripe-signature");
  if (signature === null) {
    return Response.json({ error: "no signature" }, { status: 400 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (error) {
    // Never log the body or the signature: one is a customer's billing data and the other is the
    // thing an attacker is trying to forge.
    log.warn({ err: error instanceof Error ? error.message : "unknown" }, "stripe webhook signature rejected");
    return Response.json({ error: "bad signature" }, { status: 400 });
  }

  const db = getDb();

  // The claim, first and in one statement. Everything below runs only for a first delivery.
  const outcome = await recordEvent(db, event.id, event.type);
  if (outcome === "repeat") {
    log.info({ eventId: event.id, type: event.type }, "stripe event already handled; ignoring redelivery");
    return Response.json({ received: true, acted: false, why: "already handled" });
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    return await applySubscription(db, event.data.object as Stripe.Subscription);
  }

  if (event.type === "customer.subscription.deleted") {
    // Deletion is still an upsert: the row keeps its period and takes the ended status, so the
    // plan read stops granting on its own terms rather than by the row vanishing. A missing row
    // and an ended row answer the same question, and only one of them can be looked at afterwards.
    return await applySubscription(db, event.data.object as Stripe.Subscription);
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    // **Resolved through the object graph**, which is also why this needs the client: the invoice
    // names a subscription id, and the subscription is the thing that says what plan and what
    // period. Re-reading it is how a renewal and a failed charge both land as the truth Stripe
    // holds rather than as our guess from an invoice's fields.
    const subscriptionId = subscriptionIdOnInvoice(event.data.object as Stripe.Invoice);
    if (subscriptionId === undefined) {
      log.info({ eventId: event.id }, "invoice carried no subscription; nothing to apply");
      return Response.json({ received: true, acted: false, why: "the invoice names no subscription" });
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return await applySubscription(db, subscription);
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    // Checkout tells us who the customer is; the subscription events carry the plan and the period.
    // Recording the mapping here means the subscription event can find an owner even when Stripe
    // delivers the two out of order, which it sometimes does.
    const session = event.data.object as Stripe.Checkout.Session;

    // **Gated on `payment_status`, not on the event alone.** An asynchronous method — a bank debit,
    // most notably — completes checkout `unpaid` and settles later, so `checkout.session.completed`
    // arriving is not the same as money having moved. The mapping below is only an id pairing and
    // is harmless either way, but the gate is here so that anything added to this branch later
    // inherits it rather than having to remember it.
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      log.info(
        { eventId: event.id, paymentStatus: session.payment_status },
        "checkout session is not paid yet; waiting for async_payment_succeeded"
      );
      return Response.json({ received: true, acted: false, why: `payment_status is ${session.payment_status}` });
    }

    const owner = session.metadata?.["owner"];
    const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (owner === undefined || customer === undefined) {
      log.warn({ eventId: event.id }, "checkout session carried no owner or no customer");
      return Response.json({ received: true, acted: false, why: "no owner or customer on the session" });
    }
    await db
      .insert(billingCustomers)
      .values({ owner, stripeCustomerId: customer })
      .onConflictDoNothing({ target: billingCustomers.owner });
    return Response.json({ received: true, acted: true });
  }

  log.info({ eventId: event.id, type: event.type }, "stripe event recorded and not acted on");
  return Response.json({ received: true, acted: false, why: "type is not handled" });
}

/**
 * Write what a subscription event says, having worked out whose it is.
 *
 * ## The customer is the ownership boundary; metadata is the fallback
 *
 * **This order was the other way round in the first version of this file, and Stripe's own billing
 * reference names the mistake**: *"Don't map asynchronous Stripe events to application objects
 * through metadata by default. Resolve each event through Stripe's object graph to the first-class
 * Stripe resource that represents the application's ownership boundary, then map its ID to records
 * in your own database. Use metadata only as an explicit fallback."*
 *
 * The reasoning holds independently of the citation. `metadata` is a free-form map that anybody
 * with Dashboard access can edit, that is absent on any object not created by our own checkout, and
 * that Stripe never validates. The **Customer** is the thing a subscription genuinely belongs to,
 * and `billing_customers` is our own record of which account that customer is. So the lookup goes
 * `subscription.customer` → `billing_customers` → owner, and metadata answers only when that finds
 * nothing — a subscription somebody created by hand in the Dashboard, which is exactly the case
 * that turns up while testing.
 */
async function applySubscription(db: ReturnType<typeof getDb>, subscription: Stripe.Subscription): Promise<Response> {
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const [mapped] = await db
    .select({ owner: billingCustomers.owner })
    .from(billingCustomers)
    .where(eq(billingCustomers.stripeCustomerId, customerId));

  // Metadata second, and only when the object graph found nothing.
  let owner = mapped?.owner;
  if (owner === undefined || owner.length === 0) owner = subscription.metadata?.["owner"];

  const rows = await db.select({ key: plans.key, priceId: plans.stripePriceId }).from(plans);
  const byPrice = new Map(rows.filter((row) => row.priceId !== null).map((row) => [row.priceId as string, row.key]));

  const facts = subscriptionFactsFrom(subscription, owner, (priceId) => byPrice.get(priceId));
  if (typeof facts === "string") {
    log.warn({ subscriptionId: subscription.id, why: facts }, "stripe subscription event could not be read");
    return Response.json({ received: true, acted: false, why: facts });
  }

  await upsertSubscription(db, facts);
  log.info({ subscriptionId: facts.id, plan: facts.planKey, status: facts.status }, "subscription written");
  return Response.json({ received: true, acted: true });
}
