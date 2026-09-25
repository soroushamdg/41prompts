/**
 * What `/pricing` says, as data — and the one number on it that Stripe also holds.
 *
 * ## The problem this module exists to solve
 *
 * `docs/roadmap.md`'s Review line for Stage 6 is **"Pricing page equals Stripe"**. A review line is
 * something a person checks on the day they write it. The mechanical version needs the page's
 * number and Stripe's number to be **one number that can be compared**, which means three things
 * have to be true at once:
 *
 * 1. the page must not carry a typed price — `$29` is **formatted from `unitAmount`**, never
 *    written as a string, so there is nothing to retype and nothing to forget to retype;
 * 2. the expected Stripe side of each tier must be stated here, next to what the page prints, so
 *    a test has something to hold Stripe against;
 * 3. the comparison must be a **pure function**, so it can be exercised with a fabricated
 *    disagreement offline. A parity test that only runs when a key happens to be present is a
 *    green tick over nothing on every machine that has no key — which is every CI machine.
 *
 * `pricing.parity.test.ts` is the networked half and `pricing.test.ts` the offline half. The
 * offline half proves `priceDisagreements` actually reports a disagreement; the networked half
 * points it at the real account.
 *
 * ## Why the page renders claim ids rather than sentences
 *
 * `docs/epics/EPIC-070-stripe-and-pricing.md`: *"Every feature line on /pricing is in claims.ts
 * citing a shipped epic, or is absent."* A tier list is the single easiest place on a marketing
 * site to write something that is not true — the mockup's Team tier lists five features and none of
 * the five exists — so each line here names a **registry claim** and the page renders that claim's
 * own words under a short line. `pricing.test.ts` fails on a `claimId` the registry does not hold.
 *
 * That short line is **not** a claim and is deliberately not treated as one: it is the scannable word, the
 * same category as a heading or a nav entry. What a reader could hold us to is the sentence beneath
 * it, and that sentence went through `claims.ts`.
 *
 * ## Team has no price and no feature list
 *
 * ADR-007 §6, and it is not an oversight to be tidied up later. The mockup's Team tier lists
 * SSO/SAML, roles and an audit log, a shared blok library and private judge models; none exists and
 * four are separately denied by `not-true-yet.ts`. A tier with nothing to sell is a contact link.
 */

/** The Stripe side of a tier: what the account is expected to hold for it. */
export interface StripeSideOfTier {
  /** Unique per Stripe account, and a **strongly consistent** read — see `lib/billing/provision.ts`. */
  readonly lookupKey: string;
  /** Cents. The page's printed amount is formatted from this and from nothing else. */
  readonly unitAmount: number;
  readonly currency: string;
  readonly interval: "month";
}

/**
 * One line in a tier's list: the words a reader scans, and the registered claim under them.
 *
 * `line`, not the obvious word for it — ADR-003 forbids that one in every code identifier and UI
 * string, and `scripts/forbidden-words.mjs` fails the build on it.
 */
export interface TierFeature {
  readonly line: string;
  /** An id in `claims.ts`. `pricing.test.ts` fails when it is not one. */
  readonly claimId: string;
}

export interface PricingTier {
  readonly key: "free" | "pro" | "team";
  readonly name: string;
  /**
   * The words under the amount. Absent on Team, which has no amount to qualify.
   */
  readonly cadence?: string;
  /**
   * A line of plain structural text above the list, where a tier builds on the one before it.
   * "Everything in Free" is not a claim — it is a statement about this page's own layout.
   */
  readonly inherits?: string;
  readonly features: readonly TierFeature[];
  readonly cta: { readonly words: string; readonly href: string };
  /** The mockup's `.tier.best`: a heavier plate on the tier being recommended. */
  readonly emphasis?: boolean;
  /** Absent where nothing is sold: Free is never bought, Team has no price (ADR-007 §1, §6). */
  readonly stripe?: StripeSideOfTier;
}

/**
 * Pro's price, stated once.
 *
 * **$29 is unvalidated and every document about it says so.** It comes from `docs/roadmap.md`,
 * which took it from the mockup; EPIC-005, the pricing-validation study, is cut. Nobody has asked a
 * customer what this is worth. ADR-007's Context paragraph is explicit that the *structure* is what
 * is expensive here and the *number* is a row in Stripe and a line on a page, both changeable next
 * week.
 */
const PRO_UNIT_AMOUNT_CENTS = 2900;

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    key: "free",
    name: "Free",
    cadence: "forever",
    features: [
      { line: "50 runs a month", claimId: "plan-free-runs" },
      { line: "The decompiler", claimId: "decompiler-no-account" },
      { line: "Checks, not opinions", claimId: "expected-bloks-are-checks" },
      { line: "Version history", claimId: "versions-automatic" },
      { line: "Publishing", claimId: "publish-is-a-release" },
    ],
    cta: { words: "Start free", href: "/sign-up" },
    // **No Stripe object, deliberately.** Free is never bought, so creating a $0 price would put an
    // object in Stripe that no checkout ever references. `pricing.test.ts` asserts it stays absent.
  },
  {
    key: "pro",
    name: "Pro",
    cadence: "per month",
    inherits: "Everything in Free, and:",
    emphasis: true,
    features: [
      { line: "5,000 runs a month", claimId: "plan-pro-runs" },
      { line: "Your own provider keys", claimId: "plan-byo-on-pro" },
      { line: "Three providers", claimId: "three-providers" },
      { line: "Two versions, one table", claimId: "ab-two-versions" },
      { line: "The same checks in CI", claimId: "cli-five-commands" },
      { line: "A 14-day trial", claimId: "plan-pro-trial" },
    ],
    cta: { words: "Start a 14-day trial", href: "/app/settings/billing" },
    stripe: {
      lookupKey: "41p_pro_monthly",
      unitAmount: PRO_UNIT_AMOUNT_CENTS,
      currency: "usd",
      interval: "month",
    },
  },
  {
    key: "team",
    name: "Team",
    // **No amount and no features** — ADR-007 §6. The cadence line is doing the work an amount
    // usually does, because the honest answer to "how much" is that there is not one yet. The empty
    // feature list is the decision rather than an omission, and `pricing.test.ts` asserts it is
    // empty rather than merely happening to be.
    cadence: "No price yet",
    features: [],
    cta: { words: "Talk to us", href: "/contact" },
  },
];

/**
 * A price as a reader sees it, formatted from cents.
 *
 * **Whole dollars have no `.00`.** `$29.00` on a pricing page reads as a number somebody copied out
 * of an invoice; `$29` is the number the mockup draws and the number a person says out loud. A
 * price with cents in it would print them, which is why this is a format rather than a truncation.
 */
export function moneyWords(cents: number, currency = "usd"): string {
  const whole = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(whole) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(whole);
}

/**
 * What the page prints for a tier's amount, or `undefined` where there is not one.
 *
 * Two of the three are special and each for its own reason. **Free's `$0` is the one literal on
 * this page**, and it is not a price: nothing is sold, so there is no Stripe object to format it
 * from and inventing a $0 Price would put an object in the account that no checkout references.
 * **Team has no amount at all** rather than a placeholder — a big dash or a "custom" reads as a
 * number withheld, and the honest statement is that there is not one yet, which the cadence line
 * makes in words a screen reader can say.
 */
export function amountWords(tier: PricingTier): string | undefined {
  if (tier.stripe) return moneyWords(tier.stripe.unitAmount, tier.stripe.currency);
  return tier.key === "free" ? "$0" : undefined;
}

/** The shape `pricing.parity.test.ts` reduces a Stripe `Price` to before comparing it. */
export interface PriceFromStripe {
  readonly lookupKey: string;
  readonly unitAmount: number | null;
  readonly currency: string;
  readonly interval: string | undefined;
  readonly active: boolean;
}

/**
 * Every way the page and Stripe disagree about one tier, in words — empty when they agree.
 *
 * **A list rather than a boolean**, because the test's failure message is the whole value of this
 * function: "the page says $29 and Stripe says $39" is a thing somebody fixes in a minute, and
 * "parity failed" is a thing somebody spends an afternoon on.
 *
 * `undefined` for `actual` means Stripe has no price under that lookup key at all, which is its own
 * sentence — the account has not been provisioned, or it is the wrong account.
 */
export function priceDisagreements(
  expected: StripeSideOfTier,
  actual: PriceFromStripe | undefined
): readonly string[] {
  if (actual === undefined) {
    return [`Stripe has no price with lookup key ${expected.lookupKey}. Has scripts/stripe-products.mts run against this account?`];
  }

  const said: string[] = [];

  if (actual.unitAmount !== expected.unitAmount) {
    const theirs = actual.unitAmount === null ? "no amount at all" : moneyWords(actual.unitAmount, actual.currency);
    said.push(`the page says ${moneyWords(expected.unitAmount, expected.currency)} and Stripe says ${theirs}`);
  }
  if (actual.currency.toLowerCase() !== expected.currency.toLowerCase()) {
    said.push(`the page prices in ${expected.currency.toUpperCase()} and Stripe prices in ${actual.currency.toUpperCase()}`);
  }
  if (actual.interval !== expected.interval) {
    said.push(`the page says ${expected.interval}ly and Stripe's price recurs ${actual.interval ?? "not at all"}`);
  }
  if (!actual.active) {
    // An archived price still answers a lookup and cannot be bought. A page offering it is offering
    // a checkout that will fail at the last step, which is the worst place to find out.
    said.push(`Stripe's price ${expected.lookupKey} is archived, and the page is still offering it`);
  }

  return said;
}

/** Every tier that has something to compare against Stripe. */
export function tiersWithAPrice(): readonly (PricingTier & { stripe: StripeSideOfTier })[] {
  return PRICING_TIERS.filter(
    (tier): tier is PricingTier & { stripe: StripeSideOfTier } => tier.stripe !== undefined
  );
}
