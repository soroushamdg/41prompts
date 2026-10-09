import { db } from "@/db";
import { PRICING_ENABLED } from "@/lib/env";
import { portalUrl } from "@/server/billing";
import { currentUserId } from "@/server/session";

export const dynamic = "force-dynamic";

/** Opens the Stripe Billing Portal: card, invoices, cancelling. */
export async function POST() {
  if (!PRICING_ENABLED) return new Response("Not found", { status: 404 });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    return Response.json({ url: await portalUrl(db, userId) });
  } catch {
    return Response.json({ error: "The billing portal did not open. Try again in a moment." }, { status: 502 });
  }
}
