import { users, type Db } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { createLogger } from "@41prompts/logger";
import { sendBillingEmail } from "@/lib/email";

/**
 * Dunning: what we say when a card stops working (EPIC-070 scope 10, ADR-007 §4).
 *
 * ## What dunning is here, and what it deliberately is not
 *
 * Stripe already does the part most people mean by dunning — it retries the charge on its own
 * schedule, keeps the subscription `past_due` while it does, and gives up after the retries are
 * exhausted. **Rebuilding that would be rebuilding the piece most likely to go wrong with somebody's
 * money.** What Stripe cannot do is tell a customer what *this product* will and will not do to
 * them in the meantime, because that is ADR-007 §4 and Stripe has never read it.
 *
 * So this is one email, and its whole job is to answer the question the customer actually has:
 * **what have I just lost?** The answer is nothing, and saying so is the point.
 *
 * ## The message is the decision, written down
 *
 * ADR-007 §4 says that when a payment fails:
 *
 * - nothing is deleted — prompts, bloks, versions and runs stay readable and exportable;
 * - **publishing to Live keeps working**, so a lapsed card cannot break somebody's deploy;
 * - new runs fall back to the Free limits;
 * - nothing is enforced retroactively.
 *
 * A dunning email that implies otherwise — "your account will be suspended", the industry's usual
 * sentence — would contradict the decision *and* `/security`'s published claim that an application
 * depending on us keeps running. The copy below is the only copy consistent with both.
 *
 * ## It survives Managed Payments, and the duplicate is accepted on purpose (EPIC-074)
 *
 * ADR-008 makes Stripe the merchant of record, and Stripe then *"automatically sends receipts,
 * invoices, refunds, and certain subscription-related emails directly to customers"*. So a customer
 * whose card fails may now get two messages.
 *
 * **Ours stays, because the two say different things.** Stripe's is about the payment: it failed,
 * here is how to fix the card. Ours is about **the product**, and it answers the question the
 * customer actually has — *what have I just lost?* — with the answer ADR-007 §4 obliges us to give:
 * nothing. Publishing to Live keeps working, every prompt and run stays readable, and new runs fall
 * back to the Free limit. Stripe has never read ADR-007 and cannot say any of that.
 *
 * The cost of being wrong in each direction is not symmetric. A second email is mildly annoying; a
 * customer who assumes a failed payment broke their production deploy, because nobody told them
 * otherwise, is a churn event and a support thread. **If this ever needs cutting, cut Stripe's**
 * subscription emails in the Dashboard rather than this one.
 *
 * ## Why a failure to send is not a failure of the webhook
 *
 * The caller answers Stripe 200 either way. A non-2xx tells Stripe to redeliver, and the event id
 * is already recorded by then, so the redelivery would be a no-op that sends nothing — the retry
 * would cost a delivery attempt and fix nothing. An email that could not be sent is logged and the
 * subscription is still written, which is the part that matters.
 */

const log = createLogger("web");

/**
 * The subject and body, as a pure function.
 *
 * Pure because **the wording is the deliverable** and a test that needs a database and a network to
 * read a sentence is a test that gets skipped on the machine where the sentence is being edited.
 * `dunning.test.ts` reads it here.
 */
export interface DunningMessage {
  readonly subject: string;
  readonly text: string;
}

export function dunningMessage(billingUrl: string): DunningMessage {
  return {
    subject: "41Prompts could not take that payment",
    text: [
      "Your card was declined, so this month's payment for 41Prompts did not go through.",
      "",
      "Nothing has been taken away. Every prompt, version and run is still there and still",
      "exportable, and publishing to Live keeps working — a payment problem is not a reason to",
      "break something you have in production. New runs fall back to the Free limit of 50 a",
      "period until the payment goes through.",
      "",
      "Stripe will try the card again over the next few days. If it is the wrong card, you can",
      "change it here:",
      "",
      billingUrl,
      "",
      "If you meant to cancel, you can do that on the same page, and you keep everything either",
      "way.",
    ].join("\n"),
  };
}

/**
 * Tell the account behind a failed invoice, if we can work out who they are.
 *
 * **Never logs the address.** `infra/ACCESS.md` rule 7's spirit applies to application logs as much
 * as to SSH sessions, and EPIC-002's own criterion — no email in any log line — is not relaxed
 * because this one is about money. The owner id is logged, which is enough to find the account and
 * is not a person's contact details.
 */
export async function sendDunningEmail(db: Db, owner: string, billingUrl: string): Promise<boolean> {
  const [account] = await db.select({ email: users.email, deletedAt: users.deletedAt }).from(users).where(eq(users.id, owner));

  if (!account) {
    log.warn({ owner }, "payment failed for an owner with no user row; no dunning email sent");
    return false;
  }
  if (account.deletedAt !== null) {
    // A deleted account still has a subscription until somebody cancels it in Stripe. Writing to
    // the address of somebody who asked to be forgotten is the one thing that must not happen here.
    log.info({ owner }, "payment failed for a deleted account; no dunning email sent");
    return false;
  }

  const message = dunningMessage(billingUrl);
  try {
    await sendBillingEmail(account.email, message.subject, message.text);
    log.info({ owner }, "dunning email sent");
    return true;
  } catch (error) {
    log.warn({ owner, err: error instanceof Error ? error.message : "unknown" }, "dunning email could not be sent");
    return false;
  }
}
