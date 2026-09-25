import { describe, expect, it } from "vitest";
import { CLAIMS } from "./claims";
import {
  PRICING_TIERS,
  amountWords,
  moneyWords,
  priceDisagreements,
  tiersWithAPrice,
  type PriceFromStripe,
  type StripeSideOfTier,
} from "./pricing";

/**
 * The offline half of `docs/roadmap.md`'s Stage 6 Review line, *"Pricing page equals Stripe"*.
 *
 * `pricing.parity.test.ts` is the half that reaches Stripe. **This is the half that proves the
 * comparison can fail**, and it is the more important of the two on most days: the networked test
 * cannot run without a key, so on every machine that has none it reports nothing. A pair of tests
 * where the only one that ever runs is the one that checks nothing is the `PARTIAL`-read-as-a-pass
 * failure `docs/PROCESS.md` keeps writing down.
 *
 * So `priceDisagreements` is a pure function over two records and every way it can disagree is
 * exercised here with a fabricated Stripe side.
 */

const PRO: StripeSideOfTier = {
  lookupKey: "41p_pro_monthly",
  unitAmount: 2900,
  currency: "usd",
  interval: "month",
};

/** What Stripe actually returns for that tier when nothing is wrong. */
const AGREEING: PriceFromStripe = {
  lookupKey: "41p_pro_monthly",
  unitAmount: 2900,
  currency: "usd",
  interval: "month",
  active: true,
};

describe("the page and Stripe are compared, and the comparison can fail", () => {
  it("says nothing when they agree", () => {
    expect(priceDisagreements(PRO, AGREEING)).toEqual([]);
  });

  /**
   * The four disagreements, each with the number in the message.
   *
   * A failure message that names both sides is the whole reason this returns sentences rather than
   * a boolean: "the page says $29 and Stripe says $39" is fixed in a minute and "parity failed" is
   * an afternoon.
   */
  it("catches a different amount, and says both numbers", () => {
    const said = priceDisagreements(PRO, { ...AGREEING, unitAmount: 3900 });
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("$29");
    expect(said[0]).toContain("$39");
  });

  it("catches a different currency", () => {
    const said = priceDisagreements(PRO, { ...AGREEING, currency: "eur" });
    expect(said.join(" ")).toMatch(/USD.*EUR/);
  });

  it("catches a price that recurs on a different interval", () => {
    expect(priceDisagreements(PRO, { ...AGREEING, interval: "year" }).join(" ")).toContain("year");
  });

  /**
   * An archived price still answers a lookup and cannot be bought.
   *
   * This is the one that would otherwise be found by a customer: the page renders, checkout opens,
   * and Stripe refuses at the last step. There is no worse place to learn it.
   */
  it("catches a price that has been archived", () => {
    expect(priceDisagreements(PRO, { ...AGREEING, active: false }).join(" ")).toContain("archived");
  });

  it("says the account has no such price at all, rather than silently agreeing", () => {
    const said = priceDisagreements(PRO, undefined);
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("41p_pro_monthly");
    expect(said[0]).toContain("stripe-products.mts");
  });

  it("reports every disagreement, not the first one", () => {
    expect(priceDisagreements(PRO, { ...AGREEING, unitAmount: 100, currency: "gbp", active: false })).toHaveLength(3);
  });
});

describe("the page's amount is formatted rather than typed", () => {
  it("prints whole dollars without cents", () => {
    expect(moneyWords(2900)).toBe("$29");
  });

  it("prints cents when there are any, rather than hiding them", () => {
    // The control on the rule above. A truncation would read $29 here, which is the shape of a
    // pricing page that undercharges by up to 99 cents in print.
    expect(moneyWords(2950)).toBe("$29.50");
  });

  it("formats in the price's own currency", () => {
    expect(moneyWords(2900, "eur")).toBe("€29");
  });

  /**
   * **The assertion this whole module exists for.** The page's number and the number the parity
   * test holds Stripe against are the same value passed through one function, so there is no way
   * for one to change without the other.
   */
  it("prints Pro's amount from the same cents the parity test compares", () => {
    const pro = PRICING_TIERS.find((tier) => tier.key === "pro");
    expect(pro?.stripe?.unitAmount).toBe(2900);
    expect(amountWords(pro!)).toBe(moneyWords(pro!.stripe!.unitAmount, pro!.stripe!.currency));
  });

  /**
   * The control on "formatted rather than typed", and it is written as an exhaustive list rather
   * than as an absence.
   *
   * A `"$29"` creeping back into this module is exactly the drift the format exists to prevent, and
   * it would pass every assertion above. `"$0"` is the one literal that belongs here — Free is never
   * bought, so there is no Stripe object to format it from — and naming it explicitly is what stops
   * this test from being quietly widened to let a second one in.
   */
  it("holds exactly one currency literal, and it is Free's zero", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./pricing.ts", import.meta.url), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    expect(code.match(/"\$[^"]*"/g) ?? []).toEqual(['"$0"']);
  });
});

describe("what each tier is allowed to say", () => {
  it("has the three tiers ADR-007 names", () => {
    expect(PRICING_TIERS.map((tier) => tier.key)).toEqual(["free", "pro", "team"]);
  });

  /**
   * ADR-007 §6, as a test rather than as a sentence in a decision record.
   *
   * Team's five mockup features — SSO/SAML, roles, an audit log, a shared blok library, private
   * judge models — do not exist and four are separately denied by `not-true-yet.ts`. A tier with
   * nothing to sell is a contact link, and the empty list is the decision.
   */
  it("gives Team no price, no Stripe object and no feature list", () => {
    const team = PRICING_TIERS.find((tier) => tier.key === "team");
    expect(team?.stripe).toBeUndefined();
    expect(team?.features).toEqual([]);
    expect(amountWords(team!)).toBeUndefined();
  });

  it("gives Free no Stripe object, because nothing is sold", () => {
    const free = PRICING_TIERS.find((tier) => tier.key === "free");
    expect(free?.stripe).toBeUndefined();
    expect(amountWords(free!)).toBe("$0");
  });

  it("offers exactly one thing to buy, which is the one the provisioning script creates", () => {
    expect(tiersWithAPrice().map((tier) => tier.stripe.lookupKey)).toEqual(["41p_pro_monthly"]);
  });

  /**
   * The epic's criterion: *"Every feature line on /pricing is in claims.ts citing a shipped epic,
   * or is absent."*
   *
   * `claims.test.ts` already proves every registry entry names an epic with a report and a path
   * that exists. This is the join between the two: a tier line can only point at the registry, so
   * a feature invented on the page is a failing test rather than a sentence somebody has to notice.
   */
  it.each(PRICING_TIERS.flatMap((tier) => tier.features.map((f) => [tier.key, f.claimId] as const)))(
    "%s's %s is a registry claim",
    (_tier, claimId) => {
      expect(CLAIMS[claimId], `${claimId} is on /pricing and not in claims.ts`).toBeDefined();
    }
  );

  it("would notice a feature that is not a claim", () => {
    // The control. Without it the rule above passes trivially the day somebody empties the lists.
    expect(CLAIMS["unlimited-everything-forever"]).toBeUndefined();
    expect(PRICING_TIERS.flatMap((tier) => tier.features).length).toBeGreaterThan(5);
  });
});
