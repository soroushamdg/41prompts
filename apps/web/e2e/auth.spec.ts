import { expect, test } from "@playwright/test";
import { deleteTestUser, latestMagicLinkTokenFor, sessionCountFor } from "./db";

const CAPTURING = process.env.E2E_CAPTURE === "1";

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}@example.com`;
}

async function signInByMagicLink(page: import("@playwright/test").Page, email: string, next?: string): Promise<void> {
  await page.goto(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  const token = await latestMagicLinkTokenFor(email);
  await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=${encodeURIComponent(next ?? "/app/projects")}`);
}

test.describe("auth", () => {
  test("signing in from a standing start lands somewhere you can work from", async ({ page }) => {
    // Asserted as a destination a person can use, not as a path the code happened to produce.
    // The previous version of this test navigated to `/app` and asserted `next=/app` — and `/app`
    // was a dead end with no route to any project. The gate could not fail on the defect because
    // the defect was what it asserted. See PROCESS.md, "a test written from the implementation".
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fprojects/);
  });

  test("rejects an absolute URL and a protocol-relative URL as next", async ({ page }) => {
    await page.goto("/sign-in?next=https://evil.example");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/app/projects");

    await page.goto("/sign-in?next=//evil.example");
    await expect(page.locator('input[name="next"]').first()).toHaveValue("/app/projects");
  });

  /**
   * The assertion the old suite never made: **a person who signs in can reach their work.**
   *
   * Everything here is stated as something a user needs — they land on a page with their projects
   * on it, they can see who they are signed in as, and they can get to Account and sign out from
   * there. None of it is read off the handler. `/app` is exercised as an entry point people still
   * have bookmarked, and what is asserted is where it *takes* them.
   */
  test("signing in reaches the projects page, and account controls are there", async ({ page }) => {
    const email = uniqueEmail("lands");
    try {
      await signInByMagicLink(page, email);
      await expect(page).toHaveURL(/\/app\/projects$/);
      await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();

      // A new account has nothing yet; the empty state is the page, not a blank.
      await expect(page.getByText("No projects yet")).toBeVisible();

      // The controls that used to exist only on the dead end.
      await expect(page.getByText(email)).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Account" })).toBeVisible();

      // The old landing path is still a way in, and it must not strand anyone.
      await page.goto("/app");
      await expect(page).toHaveURL(/\/app\/projects$/);

      // And Account gets you back rather than to a page with no way onward.
      await page.getByRole("link", { name: "Account" }).click();
      await expect(page).toHaveURL(/\/app\/account$/);
      await page.getByRole("link", { name: "Back" }).click();
      await expect(page).toHaveURL(/\/app\/projects$/);
    } finally {
      await deleteTestUser(email);
    }
  });

  test("magic-link sign-up honours an explicit next, and round-trips the email", async ({ page }) => {
    const email = uniqueEmail("signup");
    try {
      await signInByMagicLink(page, email, "/app/account");
      await expect(page).toHaveURL(/\/app\/account$/);
      // Scoped to the page, not the chrome: the shared app header shows the same address on every
      // signed-in route, so a bare `getByText` matches twice. What this test is about is that the
      // *account page* round-tripped the right identity.
      await expect(page.getByRole("main").getByText(email)).toBeVisible();
    } finally {
      await deleteTestUser(email);
    }
  });

  test("sign-out kills the session server-side", async ({ page, context }) => {
    const email = uniqueEmail("signout");
    try {
      await signInByMagicLink(page, email);
      await expect(page).toHaveURL(/\/app\/projects$/);
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
      await expect(page).toHaveURL(/\/app\/projects$/);

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
      await expect(page).toHaveURL(/\/app\/projects$/);

      await page.goto("/");
      await expect(page.getByTestId("nav-dashboard")).toBeVisible();
      await expect(page.getByTestId("nav-sign-in")).toHaveCount(0);

      const header = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
      const body = await (await request.get("/", { headers: { cookie: header } })).text();
      expect(body).toContain("Go to dashboard");
      expect(body).not.toContain("nav-sign-in");

      // The assertions above are the test; this line is documentation. It writes into the working
      // tree, so it only runs under `pnpm e2e:capture` — a suite that rewrites committed files on
      // every ordinary run makes `git status` useless as a signal.
      if (CAPTURING) {
        await page.locator(".site-nav").screenshot({
          path: "docs/epics/reports/screenshots/host-split/nav-signed-in.png",
        });
      }
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
