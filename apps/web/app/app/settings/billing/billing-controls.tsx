"use client";

import { Button } from "@41prompts/ui";
import { useState, useTransition } from "react";
import { openPortalAction, startCheckoutAction, type BillingActionResult } from "./actions";

/**
 * The two buttons, and the three states this page can be in.
 *
 * ## A button that cannot work is not rendered
 *
 * `configured` is false on a deployment with no Stripe — a self-hosted one, and this repository
 * today. The panel says so rather than offering a checkout that 500s, which is the same rule
 * EPIC-051 applied to the apps-resolving table: an absence explained beats a control that lies.
 *
 * ## Nothing here grants a plan
 *
 * Both actions end in a redirect to Stripe. What a person is on is written by the webhook, from
 * what Stripe says happened — never from a browser arriving back on a success URL, which is a thing
 * anybody can navigate to.
 */
export function BillingControls({
  configured,
  hasSubscription,
  canBuyPro,
}: {
  configured: boolean;
  hasSubscription: boolean;
  canBuyPro: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BillingActionResult | undefined>();

  const run = (action: () => Promise<BillingActionResult>) =>
    start(async () => {
      // A successful action redirects and never returns, so anything that comes back is a refusal
      // worth showing.
      setResult(await action());
    });

  if (!configured) {
    return (
      <section className="runs-panel" aria-label="Billing">
        <h2>Billing is not set up on this deployment</h2>
        <p className="runs-note">
          There is nothing to buy or manage here. Everything else works, and the run limit above is
          the Free one.
        </p>
      </section>
    );
  }

  return (
    <section className="runs-panel" aria-label="Billing">
      <h2>{hasSubscription ? "Manage your subscription" : "Upgrade"}</h2>
      <p className="runs-note">
        {hasSubscription
          ? "Change the plan, update a card, or cancel. Cancelling keeps you on your plan until the period ends, and nothing you have made is deleted either way."
          : "Pro is $29 a month. Nothing you have made is deleted if you stop paying — new runs fall back to the Free limit."}
      </p>

      <div className="keys-row-actions">
        {hasSubscription ? (
          <Button type="button" variant="primary" disabled={pending} onClick={() => run(openPortalAction)}>
            {pending ? "Opening…" : "Manage billing"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={pending || !canBuyPro}
            onClick={() => run(() => startCheckoutAction("pro"))}
          >
            {pending ? "Opening…" : "Upgrade to Pro"}
          </Button>
        )}
      </div>

      {result !== undefined && !result.ok ? (
        <p className="keys-said keys-said-refused" role="status">
          {result.message}
        </p>
      ) : null}
    </section>
  );
}
