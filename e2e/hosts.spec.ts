import { expect, test } from "@playwright/test";
import { APP_URL, SITE_URL } from "../playwright.config";

test("the site host serves the landing page", async ({ page }) => {
  await page.goto(`${SITE_URL}/`);
  await expect(page.locator("h1").first()).toContainText("Stop guessing");
});

test("the app host serves the app", async ({ request }) => {
  const res = await request.get(`${APP_URL}/api/health`);
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ ok: true });
});

test("internal trees are not reachable from the wrong host", async ({ request }) => {
  for (const url of [`${SITE_URL}/app`, `${SITE_URL}/app/settings`, `${APP_URL}/site`, `${APP_URL}/maintenance`, `${SITE_URL}/maintenance`]) {
    const res = await request.get(url);
    expect(res.status(), url).toBe(404);
  }
});

test("the app host marks itself noindex", async ({ request }) => {
  const res = await request.get(`${APP_URL}/sign-in`);
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
