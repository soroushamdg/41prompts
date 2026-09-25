import type { Metadata } from "next";
import { planUsageFor, plans } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { stripeOrUndefined } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { planTitle } from "@/lib/runs/plan-gate";
import { requireSession } from "@/lib/session";
import { SettingsNav } from "../settings-nav";
import { BillingControls } from "./billing-controls";

export const metadata: Metadata = {
  title: "Billing · 41Prompts",
  robots: { index: false, follow: false },
};

/**
 * Settings → Billing (EPIC-070).
 *
 * ## What it shows, and the one number it does not
 *
 * The plan, **runs used against the plan's run limit**, and when the period starts again. It does
 * **not** show `plans.monthly_cap_cents`, the spend rail EPIC-004 decision 6 put in to stop an
 * unbounded provider bill. ADR-007 §2: printing a safety rail turns it into a promise, and the rail
 * is ours rather than something a customer bought.
 *
 * ## The period comes from Stripe when there is a subscription
 *
 * So the meter resets when somebody is charged rather than on a date we invented. With no
 * subscription it is the calendar month in UTC, because there is no billing period to borrow and a
 * rolling window would never show a clean zero. `billing.ts` carries that argument.
 *
 * ## It renders with no Stripe configured
 *
 * A self-hosted deployment has no billing and every page still has to work. The usage meter is
 * read from our own tables and needs Stripe for nothing; only the buttons need a client, and
 * `BillingControls` says so in words rather than offering one that 500s.
 */
export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession("/app/settings/billing");
  const db = getDb();
  const usage = await planUsageFor(db, session.user.id);
  const params = await searchParams;

  // Whether a paid plan exists to offer at all — Team has no price by design (ADR-007 §6), so the
  // page offers what is actually purchasable rather than what is in the table.
  const [pro] = await db.select().from(plans).where(eq(plans.key, "pro"));
  const canBuyPro = pro?.stripePriceId !== null && pro?.stripePriceId !== undefined;

  const period = usage.period.end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <main className="app-page app-page-wide">
      <header className="app-pagehead">
        <h1>Billing</h1>
        <p className="app-state">Settings</p>
      </header>

      <SettingsNav current="billing" />

      {/* **Not a success banner that claims anything.** Checkout returning is not the same as the
          subscription existing — the webhook is what writes it, and it may land a moment later. So
          this says what actually happened and what to do if the meter below has not caught up. */}
      {params["bought"] !== undefined ? (
        <section className="runs-panel" aria-label="Checkout finished">
          <p className="runs-note" role="status">
            Checkout finished. Your plan is written when Stripe tells us it went through, which is
            usually immediate — reload this page if the plan below still says Free.
          </p>
        </section>
      ) : null}

      <section className="runs-panel" aria-label="Plan and usage">
        <h2>{planTitle(usage.plan.key)}</h2>
        <p className="runs-note">
          {usage.runsUsed} of {usage.plan.monthlyRunLimit} runs used this period. It starts again on{" "}
          {period}.
        </p>
        {usage.subscription?.cancelAtPeriodEnd === true ? (
          <p className="runs-note">
            This subscription is set to end on {period}. Until then nothing changes, and you keep
            everything you have made either way.
          </p>
        ) : null}
      </section>

      <BillingControls
        configured={stripeOrUndefined() !== undefined}
        hasSubscription={usage.subscription !== undefined}
        canBuyPro={canBuyPro}
      />
    </main>
  );
}
