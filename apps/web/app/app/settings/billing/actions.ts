"use server";

import { redirect } from "next/navigation";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/checkout";
import { stripeOrUndefined } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { appOrigin } from "@/lib/site/url";

/**
 * The two buttons on Settings → Billing.
 *
 * Both follow the canvas's order — resolve the session, scope by owner, validate, then act — and
 * both end in a `redirect` to Stripe rather than returning a URL for the browser to follow. A URL
 * returned to the client is a URL that can be replayed by somebody else; a redirect from a server
 * action is issued to the person who asked, once.
 */

export interface BillingActionResult {
  ok: boolean;
  /** Shown to the person. Present only when `ok` is false. */
  message?: string;
}

const NOT_CONFIGURED: BillingActionResult = {
  ok: false,
  message: "Billing is not set up on this deployment, so there is nothing to buy or manage here.",
};

export async function startCheckoutAction(planKey: string): Promise<BillingActionResult> {
  const session = await requireSession("/app/settings/billing");
  const stripe = stripeOrUndefined();
  if (stripe === undefined) return NOT_CONFIGURED;

  const base = appOrigin();
  const result = await createCheckoutSession(getDb(), stripe, {
    owner: session.user.id,
    email: session.user.email,
    planKey,
    // **The session id is on the success URL and nothing reads it to grant anything.** Fulfilment
    // is the webhook's (`/api/stripe/webhook`); this is so the page can say "that worked" without
    // the plan depending on somebody's browser completing a redirect.
    successUrl: `${base}/app/settings/billing?bought={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/app/settings/billing`,
  });

  if ("why" in result) return { ok: false, message: result.why };
  redirect(result.url);
}

export async function openPortalAction(): Promise<BillingActionResult> {
  const session = await requireSession("/app/settings/billing");
  const stripe = stripeOrUndefined();
  if (stripe === undefined) return NOT_CONFIGURED;

  const result = await createPortalSession(
    getDb(),
    stripe,
    session.user.id,
    session.user.email,
    `${appOrigin()}/app/settings/billing`
  );

  if ("why" in result) return { ok: false, message: result.why };
  redirect(result.url);
}
