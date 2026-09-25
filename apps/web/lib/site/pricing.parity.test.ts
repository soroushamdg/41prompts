import { describe, expect, it } from "vitest";
import { priceDisagreements, tiersWithAPrice, type PriceFromStripe } from "./pricing";
import { stripeOrUndefined } from "../billing/stripe";

/**
 * `docs/roadmap.md`'s Stage 6 Review line — **"Pricing page equals Stripe"** — pointed at the real
 * account.
 *
 * ## What this adds to `pricing.test.ts`, and what it does not
 *
 * The offline half proves the comparison **can fail**. This one proves **what Stripe currently
 * says**. Neither is sufficient: a comparison nobody points at real data is a unit test of an
 * assertion, and real data compared by a function nobody proved can disagree is a green tick.
 *
 * ## Why it is a separate file, and why it skips rather than fails without a key
 *
 * `STRIPE_SECRET_KEY` is configuration. A deployment with no Stripe is a supported state
 * (`lib/billing/stripe.ts`), CI has no key, and a self-hosted deployment never will — so a test
 * that failed without one would be a test that is red in every environment except one developer's.
 *
 * **But a silent skip is the failure this repository keeps writing down**, so the skip is not
 * silent: `it.skipIf` names the condition in the reporter's output, and the first test below runs
 * unconditionally and states which of the two modes this run was in. Reading "no STRIPE_SECRET_KEY"
 * in the output is the difference between *"parity passed"* and *"parity was not checked"*.
 *
 * ## Running it
 *
 *   export STRIPE_SECRET_KEY=…        # the sandbox's test key; never echoed, never committed
 *   pnpm --filter @41prompts/web test -- pricing.parity
 */

const stripe = stripeOrUndefined();
const configured = stripe !== undefined;

describe("the page's prices are the prices Stripe holds", () => {
  /**
   * Runs in both modes, deliberately.
   *
   * A file whose every test is conditional produces an empty green block that reads exactly like a
   * file whose every test passed. This one always says which happened.
   */
  it(`says which mode this run is in: ${configured ? "Stripe was read" : "no STRIPE_SECRET_KEY, so Stripe was not read"}`, () => {
    expect(typeof configured).toBe("boolean");
  });

  it.skipIf(!configured).each(tiersWithAPrice().map((tier) => [tier.key, tier] as const))(
    "%s matches its Stripe Price",
    async (_key, tier) => {
      // `prices.list({ lookup_keys })` and not a search: `lookup_key` is unique per account and the
      // list read is **strongly consistent**, where Stripe's search API is explicitly not. That
      // distinction already cost this epic a duplicate Pro product — `lib/billing/provision.ts`.
      const found = await stripe!.prices.list({ lookup_keys: [tier.stripe.lookupKey], limit: 1 });
      const price = found.data[0];

      const actual: PriceFromStripe | undefined =
        price === undefined
          ? undefined
          : {
              lookupKey: price.lookup_key ?? tier.stripe.lookupKey,
              unitAmount: price.unit_amount,
              currency: price.currency,
              interval: price.recurring?.interval,
              active: price.active,
            };

      const said = priceDisagreements(tier.stripe, actual);
      expect(said, said.join("; ")).toEqual([]);
    },
    // Stripe over the network, on a machine that may be on a train.
    20_000
  );

  /**
   * The control on the networked assertion above.
   *
   * It is `expect(...).toEqual([])`, which passes when the account agrees and would also pass if
   * `tiersWithAPrice()` returned nothing at all — a refactor away, and invisible. This fails first
   * if there is ever nothing to compare.
   */
  it("has at least one tier to compare, so the assertion above is not vacuous", () => {
    expect(tiersWithAPrice().length).toBeGreaterThan(0);
  });
});
