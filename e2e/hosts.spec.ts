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
  for (const url of [`${SITE_URL}/app`, `${SITE_URL}/app/settings`, `${SITE_URL}/maintenance`]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
  // On the app host an unknown path needs a session first, then 404s.
  const cookie = { cookie: "better-auth.session_token=not-a-real-session" };
  for (const url of [`${APP_URL}/site`, `${APP_URL}/maintenance`]) {
    expect((await request.get(url, { headers: cookie, maxRedirects: 0 })).status(), url).toBe(404);
  }
});

test("the app host marks itself noindex", async ({ request }) => {
  const res = await request.get(`${APP_URL}/sign-in`);
  expect(res.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
