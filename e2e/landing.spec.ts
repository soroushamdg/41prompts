import { expect, test } from "@playwright/test";
import { APP_URL, SITE_URL } from "../playwright.config";
import { PH_REVIEW_URL } from "../src/app/site/product-hunt";

/* The landing page on the site host (41prompts.ai, locally site.localhost). */

const pricingOn = process.env.NEXT_PUBLIC_PRICING_ENABLED === "true";

test("the landing page renders the hero", async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Stop guessing\s*which prompt\s*works\./);
  await expect(page.locator("#how")).toBeVisible();
});

test("with pricing off, nothing names a price", async ({ page }) => {
  test.skip(pricingOn, "NEXT_PUBLIC_PRICING_ENABLED is on for this build");
  await page.goto(`${SITE_URL}/`);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/pricing/i);
  expect(text).not.toContain("$");
  expect(text).not.toContain("Start Performance");
  expect(text).not.toContain("Billed monthly");
  await expect(page.locator("#pricing")).toHaveCount(0);
  await expect(page.locator('a[href*="#pricing"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See how it works" }).last()).toHaveAttribute("href", "#how");
});

test("Start free leads to sign-up on the app host", async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  const links = page.getByRole("link", { name: "Start free" });
  expect(await links.count()).toBeGreaterThan(1);
  for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    expect(href).toBe(`${APP_URL}/sign-in#start`);
  }
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toHaveAttribute("href", `${APP_URL}/sign-in`);
});

test("FAQ answers open and close", async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  const first = page.locator("details", { hasText: "Is my prompt private?" });
  const keys = page.locator("details", { hasText: "What do you do with my API keys?" });
  await expect(first).toHaveAttribute("open", "");
  await expect(keys).not.toHaveAttribute("open");
  await keys.locator("summary").click();
  await expect(keys).toHaveAttribute("open", "");
  await expect(keys.getByText("encrypted at rest")).toBeVisible();
  await keys.locator("summary").click();
  await expect(keys).not.toHaveAttribute("open");
});

test("the Product Hunt review badge links out", async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  const review = page.locator(`a[href="${PH_REVIEW_URL}"]`);
  expect(await review.count()).toBeGreaterThanOrEqual(1);
  await expect(review.first()).toHaveAttribute("target", "_blank");
  await expect(review.first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(review.first().locator("img")).toHaveAttribute("alt", /Product Hunt/);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("Sheet 01 shows its end state", async ({ page }) => {
    await page.goto(`${SITE_URL}/`);
    const sheet = page.getByRole("figure", { name: /pasted prompt splits into four bloks/ });
    await expect(sheet.getByText("Failure traced to B3")).toBeVisible();
    await expect(sheet.getByText("Likely cause · B3 · 82%")).toBeVisible();
  });
});

test("robots.txt and the sitemap describe the site", async ({ request }) => {
  const robots = await request.get(`${SITE_URL}/robots.txt`);
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap:");
  const sitemap = await request.get(`${SITE_URL}/sitemap.xml`);
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("/privacy</loc>");
});

test("a signed-in visitor gets Go to app instead of Sign in and Start free", async ({ page, context }) => {
  // Set by the app on the shared parent domain in production (proxy.ts);
  // locally the two hosts share none, so the test sets it on the site host.
  await context.addCookies([{ name: "41p_app", value: "1", url: SITE_URL }]);
  await page.goto(`${SITE_URL}/`);
  const header = page.locator("header").first();
  await expect(header.getByRole("link", { name: "Go to app" })).toHaveAttribute("href", `${APP_URL}/`);
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Start free" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Go to app" })).toHaveCount(5);
  await expect(page.locator("footer").getByRole("link", { name: "Go to app" })).toHaveAttribute("href", `${APP_URL}/`);
});

test("without the hint, the sign-in buttons stay", async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  await page.waitForTimeout(900);
  await expect(page.locator("header").first().getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to app" })).toHaveCount(0);
});
