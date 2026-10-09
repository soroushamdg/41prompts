import { db } from "@/db";
import { PRICING_ENABLED } from "@/lib/env";
import { checkoutUrl } from "@/server/billing";
import { getSession } from "@/server/session";

export const dynamic = "force-dynamic";

/** Starts Stripe Checkout (Managed Payments). Hidden until pricing is on. */
export async function POST() {
  if (!PRICING_ENABLED) return new Response("Not found", { status: 404 });
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in first." }, { status: 401 });
  try {
    const url = await checkoutUrl(db, { id: session.user.id, email: session.user.email, name: session.user.name });
    return Response.json({ url });
  } catch {
    return Response.json({ error: "Stripe Checkout did not open. Try again in a moment." }, { status: 502 });
  }
}
