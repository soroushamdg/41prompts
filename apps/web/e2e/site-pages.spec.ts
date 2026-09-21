import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ALL_FOOTER_LINKS, NAV_LINKS, PUBLIC_ROUTES } from "../lib/site/links";

/**
 * Every public page, walked: it answers 200, it has one `<h1>`, its chrome goes somewhere, and it
 * renders its end state with motion turned off.
 *
 * `docs/roadmap.md`'s Tests line for EPIC-072 is *"Lighthouse ≥ 90 all pages; links resolve; reduced
 * motion verified"*. The middle and the last are here. Lighthouse is
 * `scripts/lighthouse-site.mjs`, run by hand against the built app, because it needs a real Chrome
 * and minutes — the same measured argument `docs/PROCESS.md` makes about the e2e container.
 *
 * **The routes come from `lib/site/links.ts`, not from a list in this file.** A copy of a list is a
 * decision that lives somewhere else, and it goes stale silently: the page added next month would be
 * absent from the copy and this suite would report a clean walk over a site it had not fully seen.
 */

const PHONE = { width: 390, height: 844 };

test.describe("every public page", () => {
  test("has routes to walk at all", async () => {
    // Or every parameterised test below is vacuous.
    expect(PUBLIC_ROUTES.length).toBeGreaterThan(12);
  });

  for (const route of PUBLIC_ROUTES) {
    test(`${route} answers 200 with one heading`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status(), `${route} did not answer 200`).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).not.toBeEmpty();
      await expect(page.locator("main#main")).toHaveCount(1);
      // The skip link comes from `SiteNav`, so it is on every page that has a nav to skip.
      // `/sign-in` and `/sign-up` render no nav, and a skip link with nothing to skip is a
      // focusable element that does nothing — they are exempt by that rule, not by name.
      const navs = await page.locator("nav.site-nav").count();
      await expect(page.locator('a.skip-link[href="#main"]')).toHaveCount(navs > 0 ? 1 : 0);
    });
  }
});

test.describe("the chrome goes where it says", () => {
  test("every nav link answers 200", async ({ page, request }) => {
    await page.goto("/");
    for (const link of NAV_LINKS) {
      // **Scoped to `a.site-nav-link`, not to every anchor in the nav.** EPIC-016d added `Product`,
      // which points at `/` — and so does the logo, so an unscoped `[href="/"]` counts two and this
      // walk fails on a nav that is correct. Scoping to the class the section links carry asks the
      // question the walk means: is this entry rendered as a nav link, once.
      await expect(page.locator(`.site-nav a.site-nav-link[href="${link.href}"]`)).toHaveCount(1);
      expect((await request.get(link.href)).status(), `nav → ${link.href}`).toBe(200);
    }
  });

  test("every footer link answers 200 and is rendered", async ({ page, request }) => {
    await page.goto("/");
    for (const link of ALL_FOOTER_LINKS) {
      await expect(page.locator(`.site-foot a[href="${link.href}"]`)).toHaveCount(1);
      expect((await request.get(link.href)).status(), `footer → ${link.href}`).toBe(200);
    }
  });

  /**
   * The control on both walks above.
   *
   * They assert that the links we render resolve. Neither can fail if the server answers 200 to
   * everything — which is exactly what a misconfigured catch-all does — so this proves the
   * instrument can report a 404.
   */
  test("the skip link is on every page with a nav, and the control is a page without one", async ({ page }) => {
    // The positive control on the rule above: if `SiteNav` stopped rendering it, this fails.
    await page.goto("/legal/terms");
    await expect(page.locator('a.skip-link[href="#main"]')).toHaveCount(1);
    await page.goto("/sign-in");
    await expect(page.locator("nav.site-nav")).toHaveCount(0);
  });

  test("a route nobody built is a 404, so the two walks above mean something", async ({ request }) => {
    // `/pricing` is the real case: EPIC-070 builds it, and until then it is not there.
    expect((await request.get("/pricing")).status()).toBe(404);
    // **`/careers` was the other half of this control until EPIC-072b built it.** Replacing it with
    // another route somebody intends to build would put this control back on the same clock —
    // `/blog`, `/learn` and `/about` were all "nobody built it" once. This one is on no roadmap.
    expect((await request.get("/not-a-route-this-site-has")).status()).toBe(404);
  });

  test("the current page marks itself in the nav", async ({ page }) => {
    await page.goto("/features");
    await expect(page.locator('.site-nav a[href="/features"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator('.site-nav a[href="/docs"]')).not.toHaveAttribute("aria-current", "page");
  });
});

/**
 * Reduced motion shows the end state rather than skipping it — `CLAUDE.md` rule 12.
 *
 * Asserted on the rendered result, not on the CSS: the question is whether a reader who has asked
 * for no motion sees the finished page, and the way to find that out is to ask for no motion and
 * look at the page.
 */
test.describe("with motion turned off", () => {
  test.use({ reducedMotion: "reduce" });

  for (const route of PUBLIC_ROUTES) {
    test(`${route} still renders its end state`, async ({ page }) => {
      await page.goto(route);
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
      // Visible is not enough: an element mid-animation is visible and transparent, or visible and
      // translated off its place. The end state is full opacity and no transform.
      const style = await heading.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { opacity: computed.opacity, transform: computed.transform };
      });
      expect(Number(style.opacity)).toBeGreaterThan(0.99);
      expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(style.transform);
    });
  }

  test("the home page's logo is drawn, not blank", async ({ page }) => {
    await page.goto("/");
    // The morph is the one deliberate animation on the site. Reduced motion must show the letters,
    // which means the SVG has path data — a skipped animation would leave an empty plate.
    const paths = await page.locator(".site-nav svg path").count();
    expect(paths).toBeGreaterThan(0);
  });
});

test.describe("the new pages are accessible and fit a phone", () => {
  // EPIC-072b added the last two. EPIC-072's four found defects are the checklist for any new public
  // page — the nav's width at 390px, absence from `sitemap.xml`, a missing skip link, and the
  // footer's fourth group wrapping — and only the last was visible in a screenshot.
  const NEW_ROUTES = [
    "/features",
    "/delivery",
    "/docs",
    "/security",
    "/changelog",
    "/guides",
    "/legal/third-party-notices",
    "/about",
    "/careers"
  ];

  for (const route of NEW_ROUTES) {
    test(`${route} has no axe violations`, async ({ page }) => {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(
        results.violations.map((violation) => `${violation.id}: ${violation.nodes.length} node(s)`),
        JSON.stringify(results.violations.map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.html) })), null, 2)
      ).toEqual([]);
    });

    test(`${route} does not scroll sideways at 390px`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    });
  }
});

/**
 * The Ask-AI chip, which is the only interactive thing EPIC-072 adds.
 *
 * The property worth testing is not that the sheet opens. It is that **what the reader sees is what
 * gets sent** — the textarea holds the whole query and nothing is appended — and that the
 * destinations are somebody else's site rather than ours.
 */
test.describe("the Ask-AI chip", () => {
  test("shows the exact text it will send, and sends nowhere of ours", async ({ page }) => {
    await page.goto("/delivery");
    const chip = page.locator(".ask-chip").first();
    await expect(chip).toBeVisible();
    await chip.click();

    const textarea = page.locator("#ask-sheet-text");
    await expect(textarea).toBeVisible();
    const shown = await textarea.inputValue();
    expect(shown.length).toBeGreaterThan(40);

    const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Claude" }).click()]);
    const url = new URL(popup.url());
    expect(url.hostname).toBe("claude.ai");
    // The whole query, not a summary of it, and nothing added.
    expect(url.searchParams.get("q")).toBe(shown);
    await popup.close();
  });

  test("closes on Escape", async ({ page }) => {
    await page.goto("/delivery");
    await page.locator(".ask-chip").first().click();
    await expect(page.locator("#ask-sheet-text")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ask-sheet-text")).toHaveCount(0);
  });

  test("opens from the keyboard", async ({ page }) => {
    await page.goto("/features");
    const chip = page.locator(".ask-chip").first();
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#ask-sheet-text")).toBeVisible();
  });
});
