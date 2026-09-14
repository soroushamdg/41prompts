import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const CONSENT_COOKIE = "41prompts_analytics_consent";
const PHONE = { width: 390, height: 844 };

/**
 * **What this actually proves, corrected 2026-09-14.**
 *
 * PostHog is called **server-side** here (`posthog-node`); there is no `posthog-js` and no
 * client-side analytics at all. So intercepting browser traffic can never observe a capture, and the
 * assertion below is *not* evidence that the consent gate works — it would pass even if every event
 * fired. It was written as though it were, which is the same mistake as a test that asserts its own
 * helper's reload.
 *
 * What it is genuinely worth: it fails the moment somebody adds a client-side analytics tag, which
 * is the one way analytics could start reaching the browser and bypass the server-side gate
 * entirely. Kept for that, named for that.
 *
 * **The gate itself is proved in `lib/analytics/posthog-server.test.ts` and `visitor.test.ts`**,
 * where the capture function is mocked and "nothing was captured" is observable.
 */
const ANALYTICS_HOST = /i\.posthog\.com/;

async function consentCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === CONSENT_COOKIE)?.value;
}

/**
 * Wait for the cookie to reach the value a click asked for.
 *
 * **Justified, as PROCESS.md's helper rule requires.** The banner dismisses itself optimistically —
 * the state flips the moment you click, and the server action that writes the cookie resolves after
 * — so reading the cookie straight after a click is a race, and it is the *test* that is wrong
 * rather than the product. This polls the real value rather than sleeping, so it cannot hide a
 * cookie that is never written: the assertion still fails, it just fails for the right reason.
 */
async function expectConsent(page: Page, value: string | undefined) {
  await expect.poll(() => consentCookie(page), { timeout: 5_000 }).toBe(value);
}

/**
 * The theme, with the transition allowed to finish.
 *
 * The 350ms is `base.css`'s colour transition, and it is load-bearing rather than decorative: axe
 * measured this page mid-transition and reported contrast against a blended intermediate colour
 * (#84837f) that is on screen for a third of a second and never settles there. What it could hide is
 * a genuine contrast failure that only exists during the transition, which nothing is claiming to
 * check.
 */
async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  await page.waitForTimeout(350);
}

test.describe("the consent banner", () => {
  test("is offered to a visitor who has not chosen", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Analytics" });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("button", { name: "Allow" })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Decline" })).toBeVisible();
  });

  test("no analytics reaches the browser at all, so nothing can bypass the server-side gate", async ({ page }) => {
    const calls: string[] = [];
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (ANALYTICS_HOST.test(url)) calls.push(url);
      await route.continue();
    });

    await page.goto("/");
    await page.goto("/decompile");
    await expect(page.getByRole("region", { name: "Analytics" })).toBeVisible();
    expect(calls, "a client-side analytics tag would bypass the server-side consent gate").toEqual([]);
    expect(await consentCookie(page), "no cookie should be written until asked").toBeUndefined();
  });

  /**
   * **No dark patterns, measured (EPIC-017 decision 2).** Same size, same treatment, neither
   * pre-selected, neither auto-focused. A banner whose Accept is a filled button and whose Decline is
   * grey small print passes every functional test and is still a dark pattern, so this compares them.
   */
  test("offers Allow and Decline with equal prominence, and pre-selects neither", async ({ page }) => {
    await page.goto("/");
    const allow = page.getByRole("button", { name: "Allow" });
    const decline = page.getByRole("button", { name: "Decline" });

    const [a, d] = [await allow.boundingBox(), await decline.boundingBox()];
    expect(Math.abs(a!.height - d!.height), "different heights").toBeLessThan(2);
    expect(Math.abs(a!.width - d!.width), "wildly different widths").toBeLessThan(24);

    const classOf = async (locator: typeof allow) => (await locator.getAttribute("class")) ?? "";
    expect(await classOf(allow), "same visual treatment").toBe(await classOf(decline));

    // Neither is the focused element on load, and neither claims to be pressed.
    await expect(allow).not.toBeFocused();
    await expect(decline).not.toBeFocused();
    for (const button of [allow, decline]) {
      expect(await button.getAttribute("aria-pressed")).toBeNull();
    }
  });

  test("declining is one click, and it is remembered across a reload and a navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);
    await expectConsent(page, "denied");

    await page.reload();
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);
    await page.goto("/decompile");
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);
  });

  test("allowing is one click, and writes the granted cookie", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Allow" }).click();
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);
    await expectConsent(page, "granted");
  });

  test("is fully operable by keyboard", async ({ page }) => {
    await page.goto("/");
    const decline = page.getByRole("button", { name: "Decline" });
    await decline.focus();
    await expect(decline).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "Analytics" })).toHaveCount(0);
    await expectConsent(page, "denied");
  });

  /**
   * **The banner must not cover the page it is asking about.**
   *
   * It is `position: fixed`, so without reserving space the last control on any long page sits
   * underneath it. That shipped once and the suite caught it as two unrelated-looking click
   * timeouts in `canvas.spec.ts` and `variables.spec.ts`, which is a much worse way to find out.
   */
  test("reserves the space it covers, so nothing underneath is unreachable", async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/legal/terms");
      // Wait for the banner to exist before measuring anything about it. It mounts from an effect,
      // so on a slower machine the first evaluate can land before it is there.
      await expect(page.getByRole("region", { name: "Analytics" })).toBeVisible();

      // Polled, not read once: the banner measures itself on mount and again through a
      // ResizeObserver, so the reservation settles a frame or two after the page does. Polling the
      // real numbers still fails if the space is never reserved — it just stops failing for timing.
      //
      // `-1` rather than a throw when the bar is missing: a poll whose function throws gives up
      // instead of retrying, which is how this passed locally and failed on CI.
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const bar = document.querySelector<HTMLElement>(".consent");
              if (!bar) return -1;
              return parseInt(getComputedStyle(document.body).paddingBottom, 10) - bar.offsetHeight;
            }),
          { timeout: 10_000, message: `no space reserved at ${width}px` }
        )
        .toBeGreaterThanOrEqual(0);
    }
  });

  test("its controls clear 44px on a phone", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/");
    for (const name of ["Allow", "Decline"]) {
      const box = await page.getByRole("button", { name }).boundingBox();
      expect(box!.height, `${name} is under 44px`).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("changing the choice afterwards", () => {
  /** Withdrawal has to be as easy as consent — Law 25 and the GDPR both. A dismissed banner is not a
   *  way to withdraw anything, so the control is permanent and on the page the banner points at. */
  test("the privacy page can turn analytics back off", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Allow" }).click();
    await expectConsent(page, "granted");

    await page.goto("/legal/privacy");
    const control = page.getByRole("region", { name: "Your analytics choice" });
    await expect(control).toBeVisible();
    await expect(control.getByRole("status")).toContainText("Analytics are allowed");

    await control.getByRole("button", { name: "Turn analytics off" }).click();
    await expect(control.getByRole("status")).toContainText("Analytics are off");
    await expectConsent(page, "denied");

    // And it survives, so the withdrawal is real rather than visual.
    await page.reload();
    await expectConsent(page, "denied");
    await expect(page.getByRole("region", { name: "Your analytics choice" }).getByRole("status")).toContainText(
      "Analytics are off"
    );
  });
});

test.describe("the legal pages", () => {
  const PAGES = [
    ["terms", "Terms of service"],
    ["privacy", "Privacy"],
    ["sub-processors", "Sub-processors"],
    ["security", "Security"],
  ] as const;

  for (const [slug, title] of PAGES) {
    test(`/legal/${slug} renders real content`, async ({ page }) => {
      await page.goto(`/legal/${slug}`);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      // The stub these replaced said exactly this.
      await expect(page.getByText("not written yet")).toHaveCount(0);
      expect((await page.getByRole("main").innerText()).length).toBeGreaterThan(600);
    });

    test(`/legal/${slug} is indexable`, async ({ page }) => {
      const response = await page.goto(`/legal/${slug}`);
      expect(response!.status()).toBe(200);
      // It was `noindex` while it was a placeholder; a policy nobody can find is not much of a policy.
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    });
  }

  test("terms and privacy say a lawyer has not reviewed them, once, and nothing else does", async ({ page }) => {
    for (const slug of ["terms", "privacy"]) {
      await page.goto(`/legal/${slug}`);
      await expect(page.getByText("has not been reviewed by a lawyer")).toHaveCount(1);
    }
    for (const slug of ["sub-processors", "security"]) {
      await page.goto(`/legal/${slug}`);
      await expect(page.getByText("has not been reviewed by a lawyer")).toHaveCount(0);
    }
  });

  test("the retention table is readable on a phone without scrolling the page sideways", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("/legal/privacy");
    await expect(page.locator(".legal-table").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "the page itself must not scroll sideways").toBe(0);
  });

  test("robots.txt allows the legal pages and the sitemap lists them", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Allow: /legal/");
    expect(robots).not.toContain("Disallow: /legal/");

    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const slug of ["terms", "privacy", "sub-processors", "security"]) {
      expect(sitemap, `${slug} should be in the sitemap`).toContain(`/legal/${slug}`);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test(`axe is clean on the privacy page and the banner in the ${theme} theme`, async ({ page }) => {
      await page.goto("/");
      await setTheme(page, theme);
      await expect(page.getByRole("region", { name: "Analytics" })).toBeVisible();
      // Scoped to the banner: the landing page's own axe coverage lives in `landing.spec.ts`, and
      // re-running it here would report that page's findings against this epic.
      const banner = await new AxeBuilder({ page }).include(".consent").analyze();
      expect(banner.violations).toEqual([]);

      await page.goto("/legal/privacy");
      await setTheme(page, theme);
      const privacy = await new AxeBuilder({ page }).include("main").analyze();
      expect(privacy.violations).toEqual([]);
    });
  }
});
