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
