import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { db } from "@/db";
import { handleStripeEvent, liveDeps, stripe } from "@/server/billing";

export const dynamic = "force-dynamic";

/* Stripe webhooks: the only writer of `plan`. Mounted whether or not pricing
   is visible, so subscriptions stay correct either way. Signature-verified;
   duplicate deliveries are ignored. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !process.env.STRIPE_SECRET_KEY) return new Response("Billing is not configured.", { status: 503 });
  if (!signature) return new Response("Missing signature.", { status: 400 });
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await req.text(), signature, secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }
  try {
    const result = await handleStripeEvent(db, event, liveDeps);
    return Response.json({ received: true, result });
  } catch (error) {
    Sentry.captureException(error, { tags: { stripe_event: event.type } });
    return new Response("Webhook handling failed.", { status: 500 });
  }
}
