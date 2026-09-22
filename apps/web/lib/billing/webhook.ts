import { stripeEvents, subscriptions, type Db } from "@41prompts/db";
import type Stripe from "stripe";

/**
 * What a Stripe webhook does to this database, and the one property that makes it safe to receive.
 *
 * ## Idempotency, and why it is an insert rather than a check
 *
 * **Stripe redelivers.** On a timeout, on any non-2xx, and on its own retry schedule for up to
 * three days. A handler that is not idempotent grants a second period for one payment, and
 * `docs/PROCESS.md` puts money bugs in the P0 class with data loss and keys.
 *
 * The ledger is `stripe_events`, primary-keyed on Stripe's `evt_…`, and the check is
 * **`INSERT … ON CONFLICT DO NOTHING` returning the row**. That is deliberate and not a style
 * choice: a `SELECT` followed by an `INSERT` has a window between the two, and two concurrent
 * redeliveries — which is exactly what a timeout-then-retry produces — can both read "not seen"
 * and both proceed. One statement has no window, because the primary-key constraint is the lock.
 *
 * So `recordEvent` returns `"first"` or `"repeat"`, and only `"first"` goes on to touch a
 * subscription.
 *
 * ## An unknown type is recorded and ignored, never dropped
 *
 * Stripe adds event types, and an endpoint can be subscribed to more than its code handles. A
 * handler that silently discards what it does not recognise cannot tell *"we do not care about
 * this"* from *"we stopped caring about something we used to handle"*. The row, with
 * `handled: false`, is how that question stays answerable — and it still returns 200, because a
 * non-2xx tells Stripe to retry something that will never succeed.
 */

/** The event types this deployment acts on. Anything else is recorded with `handled: false`. */
export const HANDLED_EVENT_TYPES: readonly string[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

export function isHandledType(type: string): boolean {
  return HANDLED_EVENT_TYPES.includes(type);
}

export type EventOutcome = "first" | "repeat";

/**
 * Claim this event id, or report that it was already claimed.
 *
 * One statement, so there is no window between deciding and recording. `handled` is written from
 * the type rather than from whether the work below succeeded — the row is a record of *receipt*,
 * and a row whose meaning changed depending on a later failure would not answer the question it
 * exists for.
 */
export async function recordEvent(db: Db, id: string, type: string): Promise<EventOutcome> {
  const inserted = await db
    .insert(stripeEvents)
    .values({ id, type, handled: isHandledType(type) })
    .onConflictDoNothing({ target: stripeEvents.id })
    .returning({ id: stripeEvents.id });
  return inserted.length === 1 ? "first" : "repeat";
}

/** What a subscription event carries, once read out of Stripe's shape. */
export interface SubscriptionFacts {
  readonly id: string;
  readonly owner: string;
  readonly stripeCustomerId: string;
  readonly planKey: string;
  readonly status: string;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
}

/**
 * Write the subscription as Stripe describes it — **last writer wins, on purpose**.
 *
 * Every field comes from the event, so a replay of an older event after a newer one would move the
 * row backwards. That is survivable and the alternative is worse: Stripe delivers out of order
 * only rarely, the next event corrects it, and the plan read is bounded by
 * `currentPeriodEnd` against the clock, so the worst case is a short window rather than a
 * subscription stuck in the past. Storing a version and refusing older events would mean holding a
 * second idea of Stripe's state, which is the copy ADR-007 §3 spends its whole argument avoiding.
 *
 * **An upsert, not an insert.** `customer.subscription.updated` arrives for a row that already
 * exists, and `checkout.session.completed` can arrive after the subscription event that follows it.
 */
export async function upsertSubscription(db: Db, facts: SubscriptionFacts): Promise<void> {
  await db
    .insert(subscriptions)
    .values({
      id: facts.id,
      owner: facts.owner,
      stripeCustomerId: facts.stripeCustomerId,
      planKey: facts.planKey,
      status: facts.status,
      currentPeriodStart: facts.currentPeriodStart,
      currentPeriodEnd: facts.currentPeriodEnd,
      cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.id,
      set: {
        stripeCustomerId: facts.stripeCustomerId,
        planKey: facts.planKey,
        status: facts.status,
        currentPeriodStart: facts.currentPeriodStart,
        currentPeriodEnd: facts.currentPeriodEnd,
        cancelAtPeriodEnd: facts.cancelAtPeriodEnd,
        updatedAt: new Date(),
      },
    });
}

/**
 * Read a Stripe subscription object into our shape, or say why it cannot be read.
 *
 * Returns a **reason string** rather than throwing. A malformed event is not an exception — it is
 * an event we should record, decline to act on, and answer 200 to, because throwing means a
 * non-2xx and a redelivery of something that will fail identically for ever.
 *
 * `owner` comes from `metadata.owner`, which checkout sets when the session is created. **It is not
 * looked up from `billing_customers`** here: that lookup belongs to the caller, which has the
 * database, and keeping this function pure is what lets the tests cover the shape without one.
 */
export function subscriptionFactsFrom(
  subscription: Stripe.Subscription,
  owner: string | undefined,
  planKeyForPrice: (priceId: string) => string | undefined
): SubscriptionFacts | string {
  if (owner === undefined || owner.length === 0) return "no owner on the subscription's metadata";

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  if (priceId === undefined) return "no price on the subscription's first item";

  const planKey = planKeyForPrice(priceId);
  if (planKey === undefined) return `no plan is configured for price ${priceId}`;

  // Stripe sends seconds; JavaScript wants milliseconds. Getting this wrong puts every period in
  // 1970, which reads as "expired" — a silent, total downgrade of every paying customer.
  const start = periodSecondsOf(subscription, item, "start");
  const end = periodSecondsOf(subscription, item, "end");
  if (start === undefined || end === undefined) return "no current period on the subscription";

  return {
    id: subscription.id,
    owner,
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    planKey,
    status: subscription.status,
    currentPeriodStart: new Date(start * 1000),
    currentPeriodEnd: new Date(end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
  };
}

/**
 * The period bounds, read from wherever this API version puts them.
 *
 * Stripe moved `current_period_start` / `current_period_end` **off the subscription and onto each
 * subscription item** in the 2025-03-31 API version. Both shapes are read, item first, because a
 * deployment pinned to either version must not silently produce a 1970 period — which reads as
 * "expired" and downgrades everybody who is paying.
 */
function periodSecondsOf(
  subscription: Stripe.Subscription,
  item: Stripe.SubscriptionItem | undefined,
  which: "start" | "end"
): number | undefined {
  const fromItem = (item as unknown as Record<string, unknown> | undefined)?.[`current_period_${which}`];
  if (typeof fromItem === "number") return fromItem;
  const fromSubscription = (subscription as unknown as Record<string, unknown>)[`current_period_${which}`];
  if (typeof fromSubscription === "number") return fromSubscription;
  return undefined;
}
