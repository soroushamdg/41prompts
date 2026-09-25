import { createDb, plans, type Db } from "@41prompts/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

/**
 * Create this product's Stripe objects, and write the price ids into `plans`.
 *
 * `scripts/stripe-products.mts` is the runner; the work is here because `stripe` and
 * `@41prompts/db` resolve from `apps/web` and not from the repository root — the same constraint
 * that makes every drive script import a module inside this app rather than a package directly.
 *
 * ## It is idempotent, and that is load-bearing rather than tidy
 *
 * Re-running must not create a second Pro product at a second price: two prices for one plan means
 * some customers on one and some on the other, and a `plans.stripe_price_id` that is right for only
 * half of them.
 *
 * **The `lookup_key` on the Price is the whole mechanism, and the Product is derived from it.**
 * Stripe enforces `lookup_key` as unique per account and `prices.list({ lookup_keys })` is a
 * strongly consistent read, so finding the price finds everything: `price.product` is the
 * authoritative link to the product it belongs to.
 *
 * **It used to search products by `metadata.plan_key`, and that created a duplicate on the second
 * run.** Stripe's search API is *eventually consistent* — its own documentation says results are
 * not guaranteed to be up to date — so a re-run moments later found nothing and made a second
 * product. Caught by running the script twice rather than by reading it. A deterministic product
 * id is belt and braces on the create path, so even two runs racing produce one product.
 *
 * ## One Product per plan
 *
 * Stripe's own guidance, and the reason is visible rather than theoretical: *"Checkout Sessions and
 * invoices display the Product name on each line item, meaning if multiple tiers share one Product,
 * every line item shows the same name and customers won\'t be able to tell them apart."* So Pro is
 * its own Product rather than a second Price on a shared one.
 *
 * ## It also makes the customer portal openable, and that was found by driving it
 *
 * `billingPortal.sessions.create` fails with *"a default configuration has not been created"* until
 * the portal's settings have been saved **once** for the account. Nothing in the code can tell that
 * from any other portal failure, so `createPortalSession` reports it as "not configured yet" — which
 * is the right thing for it to say and the wrong thing for this repository to leave true. The first
 * browser drive of this epic hit exactly that, and a settings page whose one button says the feature
 * is not configured is a feature that is not shipped.
 *
 * So the configuration is created here, with the objects, for the same reason the price is: a thing
 * clicked into existence in one Dashboard exists in one account and nobody can say how it was made.
 *
 * ## What it does not create
 *
 * **Free**, which is never bought, and **Team**, which ADR-007 §6 makes a contact link with no
 * price and no checkout because its five mockup features do not exist. Creating a Team price
 * "ready for later" would put a number in Stripe that nothing on the site offers and nobody agreed.
 */

export interface SoldPlan {
  readonly planKey: string;
  readonly name: string;
  readonly description: string;
  readonly lookupKey: string;
  readonly unitAmount: number;
}

/** The plans this provisions objects for. Free and Team are deliberately absent — see above. */
const SOLD_PLANS: readonly SoldPlan[] = [
  {
    planKey: "pro",
    name: "41Prompts Pro",
    description: "5,000 runs a month, your own provider keys, and everything the workbench does.",
    lookupKey: "41p_pro_monthly",
    unitAmount: 2900,
  },
];

const CURRENCY = "usd";

/** A product id we choose, so the create path is idempotent even under a race. */
function productIdFor(planKey: string): string {
  return `41p_${planKey}`;
}

/**
 * The product for a plan, by an id we chose — a **strongly consistent** read, unlike a search.
 *
 * `products.retrieve` on a missing id throws `resource_missing`, which is the 404 rather than an
 * error worth stopping for.
 */
async function productFor(stripe: Stripe, plan: SoldPlan, say: (line: string) => void): Promise<string> {
  const id = productIdFor(plan.planKey);
  try {
    const existing = await stripe.products.retrieve(id);
    say(`product  ${plan.planKey}  found    ${existing.id}`);
    return existing.id;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "resource_missing") throw error;
  }
  const created = await stripe.products.create({
    id,
    name: plan.name,
    description: plan.description,
    metadata: { plan_key: plan.planKey },
  });
  say(`product  ${plan.planKey}  created  ${created.id}`);
  return created.id;
}

/**
 * The recurring monthly price, found by `lookup_key` or created.
 *
 * **This is the function that decides whether anything is created at all.** The price's
 * `lookup_key` is unique per account and `prices.list` is strongly consistent, so if the price
 * exists the product it belongs to is read off it and nothing is made.
 */
async function priceFor(stripe: Stripe, plan: SoldPlan, say: (line: string) => void): Promise<string> {
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1, expand: ["data.product"] });
  const existing = found.data[0];
  if (existing) {
    const productId = typeof existing.product === "string" ? existing.product : existing.product.id;
    say(`price    ${plan.lookupKey}  found    ${existing.id}  (product ${productId})`);
    return existing.id;
  }

  const productId = await productFor(stripe, plan, say);
  const created = await stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: plan.unitAmount,
    recurring: { interval: "month" },
    lookup_key: plan.lookupKey,
    // **No quantity semantics and no per-seat anything** (ADR-007 §1). Nothing in this product has
    // multi-user accounts, so a per-seat price would bill a quantity that is always 1.
    metadata: { plan_key: plan.planKey },
  });
  say(`price    ${plan.lookupKey}  created  ${created.id}`);
  return created.id;
}

export interface ProvisionResult {
  readonly changed: number;
  readonly priceIdByPlan: Readonly<Record<string, string>>;
  /** True when the account already had a default portal configuration and this made none. */
  readonly portalAlreadyConfigured: boolean;
}

/**
 * The customer portal's default configuration, created once.
 *
 * **Idempotent by asking first**, not by an upsert: `billingPortal.configurations.list` is a plain
 * list read, and a second default configuration would silently become the one customers get. What
 * it allows is what ADR-007 already decided — cancel at the period end, never immediately (§5), and
 * update a payment method, which is the whole of what a lapsed card needs.
 *
 * **`subscription_update` is deliberately absent.** There is one paid plan, so "switch plan" would
 * offer a list of one, and turning it on later is a setting rather than a migration.
 */
async function configurePortal(stripe: Stripe, say: (line: string) => void): Promise<boolean> {
  const existing = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (existing.data.length > 0) {
    say(`portal   default configuration found    ${existing.data[0]!.id}`);
    return true;
  }

  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: "41Prompts — manage your subscription",
    },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      subscription_cancel: {
        enabled: true,
        // ADR-007 §5: a customer who cancels on day 3 keeps Pro until day 30. `at_period_end` is
        // that decision expressed to Stripe; `immediately` would take back something they paid for.
        mode: "at_period_end",
      },
    },
  });
  say(`portal   default configuration created  ${created.id}`);
  return false;
}

export async function provisionPlans(
  stripe: Stripe,
  db: Db,
  say: (line: string) => void = () => {}
): Promise<ProvisionResult> {
  let changed = 0;
  const priceIdByPlan: Record<string, string> = {};

  for (const plan of SOLD_PLANS) {
    const priceId = await priceFor(stripe, plan, say);
    priceIdByPlan[plan.planKey] = priceId;

    const [row] = await db.select().from(plans).where(eq(plans.key, plan.planKey));
    if (!row) throw new Error(`plans has no "${plan.planKey}" row — run pnpm db:migrate first.`);

    if (row.stripePriceId === priceId) {
      say(`plans    ${plan.planKey}  already points at ${priceId}`);
      continue;
    }
    await db.update(plans).set({ stripePriceId: priceId }).where(eq(plans.key, plan.planKey));
    say(`plans    ${plan.planKey}  now points at ${priceId}`);
    changed += 1;
  }

  const portalAlreadyConfigured = await configurePortal(stripe, say);

  return { changed, priceIdByPlan, portalAlreadyConfigured };
}

/**
 * A client for a given secret, built here so the runner never imports `stripe` itself.
 *
 * `scripts/` sits at the repository root, where neither `stripe` nor `@41prompts/db` resolves — and
 * a directory import into `apps/web/node_modules` is not a module specifier Node accepts. Exporting
 * the constructor from inside this app is the same shape `apps/web/e2e/publish-db` already gives
 * the drive scripts.
 */
export function stripeClient(secret: string): Stripe {
  return new Stripe(secret);
}

export { createDb };
