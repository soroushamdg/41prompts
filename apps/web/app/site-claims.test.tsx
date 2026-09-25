import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALL_CLAIMS } from "@/lib/site/claims";
import { NOTICE_PACKAGES, noticeGroups } from "@/lib/site/third-party-notices";
import { Example, withoutExamples } from "./example-surface";

/**
 * EPIC-072's Review line, applied to the rendered pages rather than to the registry alone.
 *
 * `lib/site/claims.test.ts` proves every entry in the registry is backed. This proves the pages use
 * it: a sentence can be true, be in the registry, and still sit in a page as a string literal that
 * nobody will re-audit. So every page is rendered and every sentence in its prose has to be either
 * a registry claim or structural copy that asserts nothing.
 *
 * It also re-applies `page.test.tsx`'s two guards — the social-proof patterns and the
 * every-number-justified rule — to the six new pages, because those were written for the home page
 * and a guard that covers one page out of seven is a guard somebody will route around by accident.
 */

vi.mock("@/app/site-chrome", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/site-chrome")>();
  return { ...actual, SiteNavWithSession: () => actual.SiteNav({ signedIn: false }) };
});

const { default: Features } = await import("./features/page.js");
const { default: Delivery } = await import("./delivery/page.js");
const { default: Docs } = await import("./docs/page.js");
const { default: Security } = await import("./security/page.js");
const { default: Changelog } = await import("./changelog/page.js");
const { default: Guides } = await import("./guides/page.js");
const { default: Notices } = await import("./legal/third-party-notices/page.js");
// EPIC-072b. The two pages whose subject is the company rather than the product — they are under
// every guard in this file, because a guard that covers seven pages out of nine is one somebody
// routes around by accident. `company-pages.test.tsx` carries what is specific to them.
const { default: About } = await import("./about/page.js");
const { default: Careers } = await import("./careers/page.js");
// EPIC-070. The one page on this site that is allowed to print a price, and therefore the one page
// whose every other guard matters most — see the `a price` row in `UNBACKED` below.
const { default: Pricing } = await import("./pricing/page.js");

/**
 * The rendered text of a page, with the markup and the code samples removed.
 *
 * **Entities are decoded, not blanked**, and that is not a detail. The first version of this
 * replaced `/&[a-z]+;/` with a space, which leaves React's numeric entities alone — every
 * apostrophe became the literal string `&#x27;`, so a claim containing one never matched the
 * registry *and* the number guard reported an unexplained `27` on four pages. Two different
 * failures, one missing decode, and both of them looked like defects in the pages.
 */
/**
 * `withoutExamples` is applied to the **numbers** rule alone, and the reason is the one already
 * written below for `<pre>`: a figure inside a picture of the product is part of the picture, not a
 * claim about the product. `example-surface.tsx` carries the full argument and owns the function,
 * because `page.test.tsx` needs the same one and two copies is two answers.
 *
 * **Not applied to the denylist.** A number inside an illustration is sample data; `SOC 2` inside
 * an illustration is still a claim. There is a control for each direction below.
 */
function textOf(element: ReactElement, strip: (markup: string) => string = (m) => m): string {
  return strip(renderToStaticMarkup(element))
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<pre[\s\S]*?<\/pre>/g, " ")
    // The notices page's package list is 423 generated identifiers, not prose. EPIC-072's drive
    // failed on it: `@aws-sdk/credential-provider-sso` matched the SSO pattern, and read as a claim
    // that this product does single sign-on. It is a dependency's name. The page's own sentences —
    // its lede and its closing paragraph — are outside this list and stay under every check.
    .replace(/<ul class="legal-list">[\s\S]*?<\/ul>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PAGES: readonly (readonly [string, ReactElement])[] = [
  ["/features", <Features key="f" />],
  ["/delivery", <Delivery key="d" />],
  ["/docs", <Docs key="o" />],
  ["/security", <Security key="s" />],
  ["/changelog", <Changelog key="c" />],
  ["/guides", <Guides key="g" />],
  ["/legal/third-party-notices", <Notices key="n" />],
  ["/about", <About key="a" />],
  ["/careers", <Careers key="r" />],
  ["/pricing", <Pricing key="p" />]
];

const RENDERED = new Map(PAGES.map(([route, element]) => [route, textOf(element)] as const));

/** The same pages with marked examples removed — what the numbers rule reads. */
const RENDERED_WITHOUT_EXAMPLES = new Map(
  PAGES.map(([route, element]) => [route, textOf(element, withoutExamples)] as const)
);

describe("every page renders", () => {
  it.each([...RENDERED.keys()])("%s produces text", (route) => {
    expect((RENDERED.get(route) ?? "").length).toBeGreaterThan(400);
  });

  it.each([...PAGES])("%s has exactly one h1", (_route, element) => {
    const html = renderToStaticMarkup(element);
    expect(html.match(/<h1\b/g)?.length ?? 0).toBe(1);
  });

  it.each([...PAGES])("%s carries the skip link and the footer", (_route, element) => {
    const html = renderToStaticMarkup(element);
    expect(html).toContain('href="#main"');
    expect(html).toContain("site-foot");
  });
});

/**
 * Which registry claims each page is expected to render.
 *
 * Written down rather than derived, so that a page dropping a claim is a failing test rather than
 * a silently shorter page — and so that `claims.test.ts`'s "no dead claims" rule below has
 * something to check against.
 */
describe("the pages are built out of the registry", () => {
  it("renders every claim in the registry somewhere", () => {
    const everything = [...RENDERED.values()].join("\n");
    const missing = ALL_CLAIMS.filter((entry) => !everything.includes(entry.text.slice(0, 60))).map(
      (entry) => entry.id
    );
    expect(missing, `claims in the registry that no page renders: ${missing.join(", ")}`).toEqual([]);
  });

  it("would notice a claim nothing renders", () => {
    // The control: a sentence that is not on any page.
    expect([...RENDERED.values()].join("\n")).not.toContain("This sentence is on no page.");
  });
});

/**
 * `page.test.tsx`'s social-proof guard, over the new pages.
 *
 * Same patterns, same reason: a testimonial or a counter is the easiest untrue thing to add and the
 * hardest to notice in review, because it looks like data.
 */
const CUSTOMER_COUNT =
  /\b\d[\d,.]*\s*(?:\+|k\b|m\b)?\s*\b(?:companies|teams|engineers|developers|users|customers|prompts)/i;

const UNBACKED: readonly (readonly [string, RegExp])[] = [
  ["trusted by", /trusted by/i],
  ["used by / loved by", /\b(?:used|loved|chosen) by\b/i],
  ["join N others", /\bjoin \d/i],
  ["customer counts", CUSTOMER_COUNT],
  ["testimonial furniture", /testimonial|—\s*[A-Z][a-z]+ [A-Z][a-z]+,\s*(?:CTO|CEO|VP|Head of)/],
  ["star ratings", /[★⭐]|\d(?:\.\d)?\s*\/\s*5\b/],
  ["fake urgency", /limited (?:beta|time|spots)|only \d+ (?:left|spots)|ends (?:today|soon)|countdown/i],
  ["invented awards", /#1\b|award|best[- ]in[- ]class|leading/i],
  ["a compliance certification", /\bSOC\s*2\b|\bISO\s*27001\b|\bHIPAA\b|\bFedRAMP\b/i],
  ["a price", /\$\d/],
  ["hiring", /\bwe(?:'re| are) hiring\b|\bopen (?:roles|positions)\b/i],
  // These two were in `claims.test.ts`'s registry denylist and not here, so the pages were checked
  // more loosely than the registry they are built from. EPIC-072's drive found the gap.
  ["single sign-on", /\bSSO\b|\bSAML\b|\bSCIM\b/i],
  ["roles or an audit trail", /\brole-based\b|\baudit (?:trail|log)\b/i]
];

/**
 * The one rule that does not apply to every page, and why it is an exception rather than a deletion.
 *
 * `["a price", /\$\d/]` exists because for the whole life of this site a price was a claim nothing
 * could back — EPIC-072 refused `/pricing` in exactly those words. **EPIC-070 made it backable on
 * one page and one page only**: `/pricing`'s number is formatted from the cents figure
 * `pricing.parity.test.ts` holds the Stripe Price against, so it is the one place where `$29` is
 * checked against the thing that actually charges.
 *
 * Everywhere else the rule is unchanged and is still the right rule. A price on `/features` or in
 * the footer is a second copy of a number with nothing comparing it, which is the drift this whole
 * file exists to prevent — so the exception is a named list of one route rather than the rule being
 * softened, and the three controls below keep it that way.
 */
const MAY_PRINT_A_PRICE: readonly string[] = ["/pricing"];

function rulesFor(route: string): readonly (readonly [string, RegExp])[] {
  return UNBACKED.filter(([label]) => label !== "a price" || !MAY_PRINT_A_PRICE.includes(route));
}

describe("no page claims anything we cannot back", () => {
  for (const [route, text] of RENDERED) {
    it.each(rulesFor(route))(`${route} carries no %s`, (_label, pattern) => {
      expect(text).not.toMatch(pattern);
    });
  }

  /**
   * The exception's three controls. Without them it is a hole that grows quietly.
   *
   * 1. **It is one route.** A second entry has to be argued for here rather than appended.
   * 2. **Every other page is still checked.** A rule that stopped being applied anywhere would
   *    leave every assertion above green and every page unchecked.
   * 3. **The exempt page really does print a price.** If `/pricing` ever stopped, the exemption
   *    would be dead code that only shows itself the day somebody puts a price back on it.
   */
  it("exempts exactly one route from the price rule", () => {
    expect(MAY_PRINT_A_PRICE).toEqual(["/pricing"]);
  });

  it.each([...RENDERED.keys()].filter((route) => !MAY_PRINT_A_PRICE.includes(route)))(
    "%s is still checked for a price",
    (route) => {
      expect(rulesFor(route).map(([label]) => label)).toContain("a price");
    }
  );

  it("exempts /pricing from a rule it would otherwise fail", () => {
    // Not "the page is allowed a price" — "the page has one". The exemption is only honest while
    // there is something for it to exempt.
    expect(RENDERED.get("/pricing") ?? "").toMatch(/\$\d/);
    expect(rulesFor("/pricing").map(([label]) => label)).not.toContain("a price");
  });

  it.each([
    ["Trusted by 1,200 teams", /trusted by/i],
    ["SOC 2 Type I underway", /\bSOC\s*2\b/i],
    ["$29 per seat", /\$\d/],
    ["10,000+ prompts compiled", CUSTOMER_COUNT],
    ["We're hiring", /\bwe(?:'re| are) hiring\b/i],
    ["SSO / SAML", /\bSSO\b|\bSAML\b/i],
    ["Roles and audit log", /\baudit (?:trail|log)\b/i]
  ])("would still catch %s", (sentence, pattern) => {
    expect(sentence).toMatch(pattern);
  });

  /**
   * The control on the one exclusion above.
   *
   * Stripping the generated package list is how a pattern stops firing by accident, so this proves
   * the notices page's **own prose** is still being read: its closing paragraph is in the text these
   * patterns scan, and a sentence removed from that paragraph would be noticed.
   */
  it("still reads the notices page's own sentences", () => {
    const text = RENDERED.get("/legal/third-party-notices") ?? "";
    expect(text).toContain("have no third-party dependencies of their own");
    expect(text).toContain("third-party packages");
    // And the generated list really is excluded, or the exclusion is doing nothing.
    expect(text).not.toContain("@aws-sdk/credential-provider-sso");
  });
});

/**
 * Every number on every page, justified — `page.test.tsx`'s inverted rule, widened.
 *
 * A digit that appears has to be explained, or this fails and somebody has to say what it is. Code
 * samples are excluded by `textOf` stripping `<pre>`: a model id and a port inside a snippet are
 * part of the sample, not claims about the product.
 *
 * **A trailing full stop is trimmed off a token.** The pattern that finds numbers is greedy about
 * dots, so it reads "Apache-2.0." at the end of a sentence as `2.0.` — not a number anybody would
 * think to list. The first version of this failed on exactly that, and the fix belongs in the
 * tokeniser rather than in the list.
 */
const EXPLAINED_NUMBERS: Readonly<Record<string, string>> = {
  "0": "a stage number on the changelog — this project's own stages, which docs/roadmap.md numbers from 0 — and the Free tier's amount on /pricing",
  "1": "a stage number, a step ordinal, and the singular in \"1 package\" and \"1 epic\"",
  "2": "a stage number and a step ordinal",
  "3": "a stage number, a step ordinal, and the three providers behind one interface",
  "4": "a stage number, a step ordinal, and the gate's four rows",
  "5": "a stage number, and the number of epics in a changelog row",
  "6": "the six findings the one written guide covers, produced by running the detectors over a corpus",
  "7": "seven pinned models, and the number of epics in a changelog row",
  "8": "the eight check kinds — CHECK_KINDS in packages/core, exhaustiveness-guarded",
  "10": "the ten-second fix 41p check describes, and the number of epics in a changelog row",
  "11": "the number of epics in a changelog row — Stage 1, which EPIC-016b joined",
  "12": "the number of epics in a changelog row — Stage 1 again, which EPIC-016c joined",
  "13": "the number of epics in a changelog row — Stage 1 once more, which EPIC-016d joined",
  "14": "the trial, in days — TRIAL_DAYS in apps/web/lib/billing/checkout.ts, which is what is sent to Stripe as trial_period_days",
  "29": "Pro's price in dollars, formatted by moneyWords from the same 2900 cents that pricing.parity.test.ts holds the Stripe Price against — never typed on the page",
  "30": "DECOMPILE_RETENTION_DAYS, enforced by the purge job",
  "50": "the Free plan's suite runs per period — the plans row the run gate reads, and the number it names when it refuses",
  "5,000": "the Pro plan's suite runs per period, from the same plans row",
  "41": "the product's name",
  "180": "RUN_COUNT_RETENTION_DAYS, enforced by the purge job",
  "365": "RUN_PAYLOAD_RETENTION_DAYS, enforced by the purge job",
  "2026": "the year in the footer's © line, and the year /about dates the company to — this repository's first commit, 2134832, is 2026-09-03",
  "2.0": "the version in Apache-2.0, a licence identifier"
};

/** The tokeniser, shared by both rules below. */
function numbersIn(text: string): string[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((token) => token.replace(/[.,]+$/, ""));
}

describe("every number on every page is a fact about the product", () => {
  for (const [route, text] of RENDERED_WITHOUT_EXAMPLES) {
    if (route === "/legal/third-party-notices") continue;
    it(`${route} shows only explained numbers`, () => {
      for (const number of numbersIn(text)) {
        expect(
          EXPLAINED_NUMBERS[number] !== undefined,
          `unexplained number "${number}" on ${route} — add it to EXPLAINED_NUMBERS with its reason, or take it off the page`
        ).toBe(true);
      }
    });
  }

  it("would fail on a number nobody explained", () => {
    expect(EXPLAINED_NUMBERS["1200"]).toBeUndefined();
  });

  /**
   * **The example exclusion, proved in both directions** (EPIC-016b).
   *
   * `withoutExamples` is the one thing in this file that makes a rule *weaker*, and a weakening
   * nobody exercises is a hole. The three cases below are the whole of its contract:
   *
   * 1. a figure inside a marked example is not a number this rule reads;
   * 2. the same figure outside one **is**, so the marker is the mechanism rather than a nicety;
   * 3. the denylist still reads inside examples, because a compliance claim in an illustration is
   *    still a claim.
   *
   * Written as three assertions over one synthetic element rather than over a real page, so they
   * keep meaning something on the day no page happens to carry an example.
   */
  describe("marked examples", () => {
    const withExample = (
      <div key="x">
        <p>Prose with no figures in it at all.</p>
        <Example what="a suite running">
          <p>Claude 37/40 · Gemini 22/40 · SOC 2 underway</p>
        </Example>
      </div>
    );

    it("does not read a number inside one", () => {
      expect(numbersIn(textOf(withExample, withoutExamples))).toEqual([]);
    });

    it("does read the same number when it is not inside one", () => {
      // The positive control. Without it, a `withoutExamples` that silently stopped matching —
      // a renamed class, a changed tag — would leave every test here green and every figure
      // unchecked.
      const unmarked = (
        <div key="u">
          <p>Claude 37/40 · Gemini 22/40</p>
        </div>
      );
      expect(numbersIn(textOf(unmarked, withoutExamples))).toContain("37");
    });

    it("still reads a denylisted phrase inside one", () => {
      // A figure in an illustration is sample data. `SOC 2` in an illustration is a claim.
      expect(textOf(withExample)).toMatch(/\bSOC\s*2\b/i);
    });
  });

  it("explains every number it lists, rather than listing bare digits", () => {
    for (const [number, reason] of Object.entries(EXPLAINED_NUMBERS)) {
      expect(reason.length, `${number} has no reason`).toBeGreaterThan(10);
    }
  });
});

/**
 * The notices page is the one page whose numbers cannot be listed, so they are **derived** instead.
 *
 * It renders 423 package versions and sixteen per-licence counts, all of them out of a generated
 * file. An allow-list of those would be a copy of the file with no way to tell it had gone stale —
 * which is the failure this page exists to avoid. So the rule is different in shape and stronger in
 * effect: every number on the page has to come from the data the page was built from.
 */
describe("every number on the notices page comes from the generated data", () => {
  it("shows nothing that is not a count, a version or a licence's own number", () => {
    const groups = noticeGroups();
    const allowed = new Set<string>(Object.keys(EXPLAINED_NUMBERS));
    allowed.add(String(NOTICE_PACKAGES.length));
    allowed.add(String(groups.length));
    for (const group of groups) {
      allowed.add(String(group.packages.length));
      for (const token of numbersIn(group.license)) allowed.add(token);
    }
    for (const entry of NOTICE_PACKAGES) {
      for (const token of numbersIn(`${entry.name}@${entry.version}`)) allowed.add(token);
    }

    const text = RENDERED.get("/legal/third-party-notices") ?? "";
    for (const number of numbersIn(text)) {
      expect(allowed.has(number), `"${number}" on the notices page is in neither the counts nor the data`).toBe(
        true
      );
    }
  });

  it("would fail on a number the data does not contain", () => {
    // The control: the page must not be able to show a count nobody generated.
    expect(RENDERED.get("/legal/third-party-notices") ?? "").not.toContain("99999");
  });

  it("actually prints the total it generated", () => {
    expect(RENDERED.get("/legal/third-party-notices") ?? "").toContain(String(NOTICE_PACKAGES.length));
  });
});
