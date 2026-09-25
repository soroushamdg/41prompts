/**
 * Create this product's Stripe objects in **test mode**, and write the price ids into `plans`.
 *
 *   export STRIPE_SECRET_KEY=…            # never echoed, never committed
 *   export DATABASE_URL=postgres://…
 *   npx tsx scripts/stripe-products.mts
 *
 * ## Why this is a script and not a click
 *
 * A price created by hand in the Dashboard exists in exactly one account and nobody can say how it
 * was made. This runs against whichever account the key belongs to, so a sandbox, a second
 * developer's sandbox and production all get objects of the same shape — and the shape is
 * reviewable because it is in a file.
 *
 * The work is in `apps/web/lib/billing/provision.ts`; this is the runner. `stripe` and
 * `@41prompts/db` resolve from `apps/web` rather than from the repository root, which is the same
 * constraint every drive script already works around the same way.
 */
import { createDb, provisionPlans, stripeClient } from "../apps/web/lib/billing/provision";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    console.error(`${name} is not set. This script makes no objects without it.`);
    process.exit(2);
  }
  return value;
}

const secret = required("STRIPE_SECRET_KEY");
const databaseUrl = required("DATABASE_URL");

if (secret.startsWith("sk_live") || secret.startsWith("rk_live")) {
  // A live key here would create real, purchasable prices. Putting live objects in place is a
  // deliberate act with a person watching, not a side effect of running a file.
  console.error("That is a live key. This script is for test mode; refusing.");
  process.exit(2);
}

const result = await provisionPlans(stripeClient(secret), createDb(databaseUrl), (line) => console.log(line));
console.log(`\n${result.changed} plan row(s) updated. Re-running is safe and does nothing.`);
process.exit(0);
