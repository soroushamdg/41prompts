import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { reservedColourOffenders } from "./reserved-colour";

const ARTICLE = "/guides/what-your-prompt-does-not-check";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  await page.waitForTimeout(350);
}

test.describe("llms.txt", () => {
  test("is served as plain text, names all six findings, and says no account is needed", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();
    for (const name of [
      "Contradictions",
      "Rules nothing checks",
      "Rules that cannot be checked",
      "Repetition",
      "Padding",
      "Bloks that do too much"
    ]) {
      expect(body, `${name} is missing from llms.txt`).toContain(name);
    }
    expect(body).toContain("There are exactly 6");
    expect(body).toContain("No account");
    expect(body).toContain("/decompile");
    expect(body).toContain(ARTICLE);
  });

  test("carries the deployed origin, and the same one robots.txt advertises", async ({ request }) => {
    // Not compared against `baseURL`: the origin comes from `BETTER_AUTH_URL`, which is the app's own
    // configured URL and is not the port the test harness happens to use. What must hold is that
    // every generated file agrees — a sitemap on one origin and an llms.txt on another is the bug
    // this catches, and it is the one that would actually happen in a deploy.
    const llms = await (await request.get("/llms.txt")).text();
    const robots = await (await request.get("/robots.txt")).text();

    const origin = /Sitemap: (https?:\/\/[^/\s]+)/.exec(robots)?.[1];
    expect(origin, "robots.txt advertises no sitemap origin").toBeDefined();
    expect(llms).toContain(`${origin}/decompile`);
    expect(llms).toContain(`${origin}${ARTICLE}`);
  });

  test("claims nothing the product cannot do", async ({ request }) => {
    const body = await (await request.get("/llms.txt")).text();
    expect(body).toMatch(/no editor/i);
    expect(body).not.toMatch(/trusted by|customers|\b\d[\d,]*\s*(?:users|teams|companies)/i);
  });
});

test.describe("the companion article", () => {
  test("is indexable, canonical, and carries a card", async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(page.getByRole("heading", { name: "What your prompt does not check", level: 1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${ARTICLE}$`));
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
    // Unlike the legal stubs, this one is meant to be found.
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test("shows all six findings with a real example each", async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(page.locator(".article-finding")).toHaveCount(6);
    await expect(page.locator(".article-example")).toHaveCount(6);
    // The messages are the detectors' own, rendered from the corpus — spot-check two that would
    // change if a detector's copy changed.
    await expect(page.locator("body")).toContainText("If the model stops following it, nothing fails.");
    await expect(page.locator("body")).toContainText("These two cannot both hold");
  });

  test("links into the decompiler and asks for nothing", async ({ page }) => {
    await page.goto(ARTICLE);
    await page.getByRole("link", { name: "Open the decompiler" }).click();
    await expect(page).toHaveURL(/\/decompile$/);
  });

  test("is listed in the sitemap and allowed by robots.txt", async ({ request }) => {
    expect(await (await request.get("/sitemap.xml")).text()).toContain(ARTICLE);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Allow: \/guides\//);
    expect(robots).toMatch(/Allow: \/llms\.txt/);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`axe: no violations in ${theme} theme`, async ({ page }) => {
      await page.goto(ARTICLE);
      if (theme === "dark") await setTheme(page, theme);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }

  test("its call to action clears 44px on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ARTICLE);
    const box = await page.getByRole("link", { name: "Open the decompiler" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  /** Through `reserved-colour.ts` since EPIC-016c. The copy that stood here compared a hex token
   *  against a computed `rgb(…)` and could not match, so it had been passing without checking
   *  anything; that file carries the account and the positive control. No exemption here — this
   *  page has no marked examples on it. */
  test("uses no pass, fail or drift colour", async ({ page }) => {
    await page.goto(ARTICLE);
    const offenders = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: ["color", "backgroundColor", "borderLeftColor"]
    });
    expect(offenders).toEqual([]);
  });
});
