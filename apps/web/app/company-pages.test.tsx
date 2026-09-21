import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALL_FOOTER_LINKS, FOOTER_GROUPS, PUBLIC_ROUTES } from "@/lib/site/links";
import { NOT_TRUE_YET, NOT_TRUE_YET_CONTROLS } from "@/lib/site/not-true-yet";

/**
 * EPIC-072b's acceptance criteria, as tests.
 *
 * The two pages this epic builds are the only two on the site whose subject is the **company**
 * rather than the product, and every guard the site already has was written for the other kind.
 * `site-claims.test.tsx` covers them now too — it is the one that reads the denylist, the numbers
 * rule and the chrome over every page — and what is here is the part specific to these two: the
 * count of people, the words `/about` may not use, and the thing `/careers` has to say.
 *
 * **Every absence assertion below is paired with a positive control**, per `CLAUDE.md` and
 * `docs/PROCESS.md` lesson 8. Three of EPIC-043's absence assertions could never have failed, and
 * EPIC-016c found a rule-10 guard that had been passing without checking anything on four routes.
 * The control here is the mockup's own sentence, which the pattern must still match.
 */

vi.mock("@/app/site-chrome", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/site-chrome")>();
  return { ...actual, SiteNavWithSession: () => actual.SiteNav({ signedIn: false }) };
});

const { default: About } = await import("./about/page.js");
const { default: Careers } = await import("./careers/page.js");

/** The rendered markup, and the visible text with entities decoded. */
function markupOf(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

function textOf(element: ReactElement): string {
  return markupOf(element)
    .replace(/<script[\s\S]*?<\/script>/g, " ")
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

/**
 * How many people a page names, as an attribute count rather than as a guess at the markup.
 *
 * `data-person` is on the one card `/about` renders. Counting an attribute rather than an `h2` or a
 * class means restyling that card cannot change what this measures, which is the whole point of
 * having a mechanism rather than a review note.
 */
function peopleIn(markup: string): number {
  return (markup.match(/data-person="/g) ?? []).length;
}

const ABOUT = <About key="about" />;
const CAREERS = <Careers key="careers" />;

const ABOUT_MARKUP = markupOf(ABOUT);
const ABOUT_TEXT = textOf(ABOUT);
const CAREERS_TEXT = textOf(CAREERS);

const PAGES: readonly (readonly [string, ReactElement, string])[] = [
  ["/about", ABOUT, ABOUT_TEXT],
  ["/careers", CAREERS, CAREERS_TEXT]
];

describe("both pages render at all", () => {
  it.each(PAGES)("%s produces text", (_route, _element, text) => {
    // Or every assertion below is about an empty string.
    expect(text.length).toBeGreaterThan(300);
  });

  it.each(PAGES)("%s has exactly one h1", (_route, element) => {
    expect(markupOf(element).match(/<h1\b/g)?.length ?? 0).toBe(1);
  });

  it.each(PAGES)("%s carries the skip link, the nav and the footer", (_route, element) => {
    const markup = markupOf(element);
    expect(markup).toContain('href="#main"');
    expect(markup).toContain("site-nav");
    expect(markup).toContain("site-foot");
    expect(markup).toContain('id="main"');
  });

  it.each(PAGES)("%s marks no nav entry as the current page", (_route, element) => {
    // Neither is a nav entry. Marking one would tell a reader they are somewhere they are not, and
    // `SitePage`'s `current` became optional in this epic precisely so a page can decline to.
    expect(markupOf(element)).not.toContain('aria-current="page"');
  });
});

describe("/about names one person and no team", () => {
  it("names exactly one", () => {
    expect(peopleIn(ABOUT_MARKUP)).toBe(1);
  });

  it("names Soroush Bonab, as Founder", () => {
    expect(ABOUT_TEXT).toContain("Soroush Bonab");
    expect(ABOUT_TEXT).toContain("Founder");
  });

  /**
   * The control on the count. Without it a `peopleIn` that had stopped matching — a renamed
   * attribute, a changed quote style — would report 0, and `toBe(1)` would be the only thing
   * standing between a second card and a green run. This proves the counter counts.
   */
  it("would count two if there were two", () => {
    const two = renderToStaticMarkup(
      <div>
        <span data-person="A" />
        <span data-person="B" />
      </div>
    );
    expect(peopleIn(two)).toBe(2);
    expect(peopleIn("<div>no one</div>")).toBe(0);
  });

  it("says nothing about a co-founder", () => {
    expect(ABOUT_TEXT).not.toMatch(/\bco-founders?\b/i);
  });

  it("says nothing about our team", () => {
    expect(ABOUT_TEXT).not.toMatch(/\bour team\b/i);
  });

  /**
   * The controls on the two assertions above, and they are the mockup's own sentences.
   *
   * `lib/site/not-true-yet.ts` holds both patterns and the epic file rules that neither is removed
   * by this epic — the pattern is still protecting something true. These prove the patterns this
   * file uses are the ones that would fire.
   */
  it.each([
    ["Co-founder. Engineering.", /\bco-founders?\b/i],
    ["Meet our team", /\bour team\b/i]
  ])("would still catch %s", (mockupSentence, pattern) => {
    expect(mockupSentence).toMatch(pattern);
  });

  it("dates the company to the repository's first year, not the mockup's", () => {
    // `git log --reverse` → `2134832`, 2026-09-03. The mockup says 2025 and is wrong by one; the
    // epic file says to check it rather than copy it.
    expect(ABOUT_TEXT).toContain("in 2026");
    expect(ABOUT_TEXT).not.toContain("2025");
  });
});

describe("/careers says there is nothing open, and where to go instead", () => {
  it("says no roles are open", () => {
    expect(CAREERS_TEXT).toMatch(/No roles are open right now/i);
  });

  it("offers a contact route", () => {
    expect(markupOf(CAREERS)).toContain('href="/contact"');
  });

  it("lists no position to apply for", () => {
    // The three the mockup draws, none of which is real.
    for (const invented of ["Founding engineer", "Developer advocate", "Design engineer"]) {
      expect(CAREERS_TEXT).not.toContain(invented);
    }
    expect(CAREERS_TEXT).not.toMatch(/\bapply now\b/i);
  });

  /**
   * The control on the sentence itself.
   *
   * `site-claims.test.tsx` refuses `/\bopen (?:roles|positions)\b/i` on every page, which is the
   * phrase the epic's own criterion is written in. This proves the page's wording says the same
   * thing **and** that the guard it is written around is still the live one.
   */
  it("is phrased so the site-wide hiring guard still passes", () => {
    expect(CAREERS_TEXT).not.toMatch(/\bopen (?:roles|positions)\b/i);
    expect(CAREERS_TEXT).not.toMatch(/\bwe(?:'re| are) hiring\b/i);
    // The control: the guard fires on the phrase this page deliberately avoids.
    expect("We have three open roles").toMatch(/\bopen (?:roles|positions)\b/i);
  });
});

describe("neither page says anything the mockup made up", () => {
  for (const [route, , text] of PAGES) {
    it.each(NOT_TRUE_YET)(`${route} claims nothing about %s`, (_label, pattern) => {
      expect(text).not.toMatch(pattern);
    });
  }

  it.each(NOT_TRUE_YET_CONTROLS)("would still catch %s", (mockupSentence, pattern) => {
    expect(mockupSentence).toMatch(pattern);
  });
});

describe("both pages are reachable and declared", () => {
  it("are public routes", () => {
    expect(PUBLIC_ROUTES).toContain("/about");
    expect(PUBLIC_ROUTES).toContain("/careers");
  });

  it("are linked from the footer, in the group the mockup draws", () => {
    const company = FOOTER_GROUPS.find((group) => group.heading === "Company");
    expect(company, "the footer has no Company group").toBeDefined();
    expect(company?.links.map((link) => link.href)).toEqual(["/about", "/careers", "/contact"]);
  });

  it("keeps the footer at four groups, which is what the grid has room for", () => {
    // `.site-foot-grid` is `1.6fr repeat(4, 1fr)` above 940px. EPIC-072 already found the fourth
    // group wrapping; a fifth is a layout defect, so `Company` replaced `Elsewhere` rather than
    // joining it.
    expect(FOOTER_GROUPS).toHaveLength(4);
    expect(FOOTER_GROUPS.map((group) => group.heading)).not.toContain("Elsewhere");
  });

  it("adds no duplicate destination", () => {
    const hrefs = ALL_FOOTER_LINKS.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
