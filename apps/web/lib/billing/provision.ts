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

/**
 * The product's tax **classification** — and it is not a tax registration (ADR-008 §2).
 *
 * Nobody issues this. It is a string from Stripe's own published catalogue saying *what kind of
 * thing is being sold*, so that Stripe can apply the right rules under Managed Payments. It costs
 * nothing, it requires no company, and it is not a VAT, GST or HST number. Those are the things
 * **Stripe** holds, in 80+ countries, which is the entire reason for paying it 3.5%.
 *
 * That sentence is here rather than only in the ADR because "tax code" reads like "tax number" to
 * almost everybody, and somebody editing this file is exactly who must not make that mistake.
 *
 * **Why SaaS and not AI-as-a-Service** (`txcd_10105002`), which is the tempting one: what is sold
 * here is not model access. On Pro the customer brings their own provider key, so the inference is
 * theirs and their provider bills them for it. What we charge for is cloud software — not
 * customised per buyer, nothing downloaded — sold to commercial users, which is `txcd_10103001`
 * exactly. ADR-008 §3 has the comparison and names this as the one line for an accountant.
 */
const PRODUCT_TAX_CODE = "txcd_10103001";

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

/**
 * Stripe returns `tax_code` as an id or as an expanded object, depending on the request.
 *
 * Reading only the string shape would make the comparison above fail on an account where it is
 * expanded, and the script would then "set" a code that is already set on every single run — an
 * idempotent script that writes every time, which is the property this file exists to protect.
 */
function taxCodeIdOf(taxCode: string | { id: string } | null | undefined): string | undefined {
  if (taxCode === null || taxCode === undefined) return undefined;
  return typeof taxCode === "string" ? taxCode : taxCode.id;
}

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
    tax_code: PRODUCT_TAX_CODE,
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
async function priceFor(
  stripe: Stripe,
  plan: SoldPlan,
  say: (line: string) => void
): Promise<{ priceId: string; productId: string }> {
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1, expand: ["data.product"] });
  const existing = found.data[0];
  if (existing) {
    const productId = typeof existing.product === "string" ? existing.product : existing.product.id;
    say(`price    ${plan.lookupKey}  found    ${existing.id}  (product ${productId})`);
    return { priceId: existing.id, productId };
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
  return { priceId: created.id, productId };
}

/**
 * Make sure the product carries its tax classification — **on every run, not only on create**.
 *
 * ## This was a real bug and it was found by running the script rather than by reading it
 *
 * The first version of EPIC-074 put this inside `productFor`, which looks right and is not:
 * `priceFor` finds the price by `lookup_key` and **returns before `productFor` is ever called**.
 * So on every account that already had the price — which is every account after its first run, and
 * therefore every account that matters — the tax code was never written, the script reported
 * success, and the next Managed Payments checkout would have failed with the same `400` EPIC-070
 * already spent a session on.
 *
 * It runs unconditionally now, and it is still idempotent: it reads first and writes only on a
 * difference. A script that writes every time is not idempotent, it is merely convergent, and the
 * whole argument for this file is the stronger property.
 *
 * `tax_code` comes back as an id or as an expanded object depending on the request, so both shapes
 * are read; comparing only the string would make every run see a difference and write again.
 */
async function ensureTaxCode(stripe: Stripe, productId: string, say: (line: string) => void): Promise<boolean> {
  const product = await stripe.products.retrieve(productId);
  if (taxCodeIdOf(product.tax_code) === PRODUCT_TAX_CODE) {
    say(`taxcode  ${productId}  already ${PRODUCT_TAX_CODE}`);
    return false;
  }
  await stripe.products.update(productId, { tax_code: PRODUCT_TAX_CODE });
  say(`taxcode  ${productId}  set to ${PRODUCT_TAX_CODE}  (was ${taxCodeIdOf(product.tax_code) ?? "unset"})`);
  return true;
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
    const { priceId, productId } = await priceFor(stripe, plan, say);
    priceIdByPlan[plan.planKey] = priceId;

    // Unconditional, and after the price rather than inside it — see `ensureTaxCode`. Without a
    // tax code every Managed Payments checkout fails at its last step (ADR-008 §3, EPIC-074).
    if (await ensureTaxCode(stripe, productId, say)) changed += 1;

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
