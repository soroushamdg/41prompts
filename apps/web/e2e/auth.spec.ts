import { expect, test } from "@playwright/test";
import { deleteTestUser, latestMagicLinkTokenFor, sessionCountFor } from "./db";

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}@example.com`;
}

async function signInByMagicLink(page: import("@playwright/test").Page, email: string, next?: string): Promise<void> {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  const token = await latestMagicLinkTokenFor(email);
  await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=${encodeURIComponent(next ?? "/app")}`);
}

test.describe("auth", () => {
  test("unauthenticated GET /app redirects to /sign-in with next", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp/);
  });

  test("rejects an absolute URL and a protocol-relative URL as next", async ({ page }) => {
    await page.goto("/sign-in?next=https://evil.example");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/app");

    await page.goto("/sign-in?next=//evil.example");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/app");
  });

  test("magic-link sign-up lands on /app showing the email, and next round-trips", async ({ page }) => {
    const email = uniqueEmail("signup");
    try {
      await signInByMagicLink(page, email, "/app/account");
      await expect(page).toHaveURL(/\/app\/account$/);
      await expect(page.getByText(email)).toBeVisible();
    } finally {
      await deleteTestUser(email);
    }
  });

  test("sign-out kills the session server-side", async ({ page, context }) => {
    const email = uniqueEmail("signout");
    try {
      await signInByMagicLink(page, email);
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByText(email)).toBeVisible();

      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      expect(await sessionCountFor(email)).toBe(0);

      // Force the request through even if the browser already dropped the expired cookie —
      // the server-side check is what this test is verifying, not the browser's own behavior.
      const cookies = await context.cookies();
      const sessionCookie = cookies.find((cookie) => cookie.name.endsWith("session_token"));

      await page.goto("/app");
      await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp/);
      expect(sessionCookie).toBeUndefined();
    } finally {
      await deleteTestUser(email);
    }
  });

  test("a signed-out cookie cannot reach /app, even replayed by hand", async ({ page, context, browser }) => {
    // The existing sign-out test checks the browser no longer *holds* the cookie. This checks the
    // half that matters once the cookie is scoped to a parent domain: the value itself is dead
    // server-side, so a copy kept anywhere — another tab, another subdomain, a clipboard — is
    // worthless. Signing out has to kill the session, not just the browser's copy of it.
    const email = uniqueEmail("replay");
    try {
      await signInByMagicLink(page, email);
      await expect(page).toHaveURL(/\/app$/);

      const before = (await context.cookies()).find((cookie) => cookie.name.endsWith("session_token"));
      expect(before, "no session cookie was set on sign-in").toBeDefined();

      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      expect(await sessionCountFor(email)).toBe(0);

      // A brand-new browser context carrying only the captured cookie.
      const replay = await browser.newContext();
      await replay.addCookies([{ ...before!, name: before!.name, value: before!.value }]);
      const attacker = await replay.newPage();
      await attacker.goto("/app");
      await expect(attacker).toHaveURL(/\/sign-in\?next=%2Fapp/);
      await replay.close();
    } finally {
      await deleteTestUser(email);
    }
  });

  /**
   * The landing nav's signed-in state, proved in the **server-rendered HTML**.
   *
   * `site-chrome.test.tsx` pins the markup for each state; this proves the session read works through
   * a real sign-in, and — by fetching the page with the cookie and reading the raw body — that the
   * right answer is in the first byte rather than swapped in after hydration. An effect-driven nav
   * would pass every assertion above this one and still flash "Sign in" at everybody who has an
   * account.
   */
  test("the landing nav offers the dashboard once signed in, in the first byte of HTML", async ({ page, request }) => {
    const email = uniqueEmail("nav");
    try {
      await signInByMagicLink(page, email);
      await expect(page).toHaveURL(/\/app$/);

      await page.goto("/");
      await expect(page.getByTestId("nav-dashboard")).toBeVisible();
      await expect(page.getByTestId("nav-sign-in")).toHaveCount(0);

      const header = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
      const body = await (await request.get("/", { headers: { cookie: header } })).text();
      expect(body).toContain("Go to dashboard");
      expect(body).not.toContain("nav-sign-in");

      await page.locator(".site-nav").screenshot({
        path: "docs/epics/reports/screenshots/host-split/nav-signed-in.png",
      });
    } finally {
      await deleteTestUser(email);
    }
  });

  test("account delete sets deletedAt, kills the session, and refuses re-sign-in", async ({ page }) => {
    const email = uniqueEmail("delete");
    try {
      await signInByMagicLink(page, email);
      await page.goto("/app/account/delete");
      await page.getByRole("button", { name: "Delete my account" }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      expect(await sessionCountFor(email)).toBe(0);

      // A fresh magic link for the same (now soft-deleted) email must not establish a session.
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Send sign-in link" }).click();
      await expect(page.getByRole("status")).toBeVisible();
      const token = await latestMagicLinkTokenFor(email);
      await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp`);
      expect(await sessionCountFor(email)).toBe(0);
    } finally {
      await deleteTestUser(email);
    }
  });
});
