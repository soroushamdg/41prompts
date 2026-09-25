import Stripe from "stripe";

/**
 * The Stripe client, and the three variables it needs.
 *
 * ## Nothing is committed, and nothing is invented
 *
 * `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PUBLISHABLE_KEY` are read from the
 * environment and are absent from every tracked file — `.env.example` names them and holds no
 * value. `apps/web/e2e/env.mjs` invents placeholders for the auth variables because a signing
 * secret's *value* does not matter to a test that only needs one to exist; it does **not** invent
 * these, and the reason is the opposite of convenience: a made-up Stripe key produces a client that
 * fails at the network instead of at configuration, which moves the failure a long way from its
 * cause.
 *
 * ## Absent is a state, not an error
 *
 * `stripeOrUndefined()` returns `undefined` when the key is unset, so a deployment with no Stripe
 * configured serves every page and simply has no billing. That is the state this repository is in
 * today, and it is the state a self-hosted deployment is in permanently. The routes that need a
 * client say so in words rather than throwing a 500 at somebody who never asked for billing.
 */

let client: Stripe | undefined;

export function stripeOrUndefined(): Stripe | undefined {
  const key = process.env.STRIPE_SECRET_KEY;
  if (key === undefined || key.length === 0) return undefined;
  // Memoised: a new client per request re-reads config and re-allocates an agent on a path that
  // runs on every webhook delivery.
  client ??= new Stripe(key);
  return client;
}

export function webhookSecret(): string | undefined {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  return secret === undefined || secret.length === 0 ? undefined : secret;
}

// **There is deliberately no `billingConfigured()` here yet.** It was written ahead of the pages
// that would read it — /pricing and Settings → Billing — and `pnpm dead-code` refused it, which is
// the gate working: a module's export list is a statement about what it offers, and it stops being
// true a few symbols at a time. It arrives with the page that calls it. Until then
// `stripeOrUndefined() !== undefined` is the same question asked at the call site.
