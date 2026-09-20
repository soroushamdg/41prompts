import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { expectNoHorizontalOverflow } from "./overflow";
import { addBlok, newPrompt, signIn } from "./runs-helpers";

/**
 * The app shell (EPIC-023).
 *
 * The **group set** is a unit test (`app/app/app-rail.test.tsx`) because the rail is pure and a
 * browser adds nothing to that assertion. What this spec owes is the half a unit test cannot see:
 * that the shell renders on every route of the built app, that its links actually arrive, that it
 * fits a phone, and that it is operable from the keyboard.
 */

const EMAIL = `app-shell-${Date.now()}@example.test`;
const RAIL = ".app-shell-rail .app-rail";

/** The rail's own links, scoped to the desktop column so the disclosure's copy is never matched. */
const railLink = (page: Page, name: string) =>
  page.locator(RAIL).getByRole("link", { name, exact: true });

test.describe("the app shell", () => {
  test.afterAll(async () => {
    await deleteTestUser(EMAIL);
  });

  test("reaches all five of a prompt's destinations, and Connect, without typing a URL", async ({
    page
  }) => {
    await signIn(page, EMAIL);
    const promptId = await newPrompt(page, "Shell walk");
    await addBlok(page, "context", "You classify refund requests.");

    // The prompt's own four, each reached from the rail and each returning to the rail.
    for (const [name, pattern] of [
      ["Runs", /\/app\/pr\/pr_[0-9a-f]{8}\/runs$/],
      ["Versions", /\/app\/pr\/pr_[0-9a-f]{8}\/versions$/],
      ["Deploy", /\/app\/pr\/pr_[0-9a-f]{8}\/deploy$/],
      ["Blok Editor", /\/app\/pr\/pr_[0-9a-f]{8}$/]
    ] as const) {
      await railLink(page, name).click();
      await expect(page, `rail → ${name}`).toHaveURL(pattern);
    }

    // **Connect is the project's, and the rail says so.** It is project-scoped, so opening it drops
    // the prompt out of the URL and the prompt group with it — which is correct. The first version
    // of this test walked Connect in the middle and timed out looking for `Blok Editor`, and that
    // was the product stranding somebody rather than the test being wrong. The rail now shows the
    // project *and* the prompt on a prompt route, so there is always a way back down.
    await railLink(page, "Connect").click();
    await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}\/connect$/);

    await railLink(page, "Prompts").click();
    await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}$/);
    await page.getByRole("link", { name: "Shell walk" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pr/${promptId}$`));

    // And back out to the workspace, from the same rail.
    await railLink(page, "Projects").click();
    await expect(page).toHaveURL(/\/app\/projects$/);
  });

  test("marks exactly one rail item current, and it is the page you are on", async ({ page }) => {
    await signIn(page, EMAIL);
    await newPrompt(page, "Shell current");
    await addBlok(page, "context", "Anything.");

    await railLink(page, "Runs").click();
    const current = page.locator(`${RAIL} [aria-current="page"]`);
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText("Runs");

    // A run's results page is reached through Runs and belongs to it, so Runs stays marked rather
    // than the rail going blank on the one page somebody arrives at without having navigated.
    await railLink(page, "Versions").click();
    await expect(page.locator(`${RAIL} [aria-current="page"]`)).toHaveText("Versions");
  });

  test("shows the prompt's name and its Draft state on every one of its pages", async ({ page }) => {
    await signIn(page, EMAIL);
    await newPrompt(page, "Shell state");
    await addBlok(page, "context", "Anything.");

    for (const name of ["Runs", "Versions", "Deploy"] as const) {
      await railLink(page, name).click();
      // The rail heads each group with its record's name — `Workspace`, the project, the prompt,
      // `Account`. The prompt's is the third, and `newPrompt` gives the project a timestamped name,
      // so asserting `nth(1)` here read the project's and was this test's own bug.
      await expect(page.locator(`${RAIL} .app-rail-groupname`).nth(2)).toHaveText("Shell state");
      // …and the bar carries the version state, which before this epic appeared on the prompt page
      // and nowhere else. `docs/design/README.md`'s vocabulary, not the mockup's `v7 · unsaved`.
      await expect(page.locator(".app-topbar .pill")).toContainText(/^Draft v\d+/);
      await expect(page.locator(".app-topbar .pill")).not.toContainText("unsaved");
    }
  });

  test("names where you are, two deep, with the last segment not a link", async ({ page }) => {
    await signIn(page, EMAIL);
    await newPrompt(page, "Shell crumbs");
    await addBlok(page, "context", "Anything.");
    await railLink(page, "Deploy").click();

    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.locator("li")).toHaveCount(2);
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText("Deploy");
    await crumbs.getByRole("link", { name: "Shell crumbs" }).click();
    await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}$/);
  });

  /**
   * **The rail is ten links in front of every page's content.** The chrome it replaced was four
   * controls, which is a short enough tab that `/app` never had a skip link — and the criterion
   * asking for one was nearly ticked on pages that had none.
   */
  test("a keyboard reader can skip the rail, and lands in the page", async ({ page }) => {
    await signIn(page, EMAIL);
    await page.goto("/app/projects");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    // Visible only on focus, which is the whole pattern: it must be reachable and must not be in
    // the way of anyone who is not tabbing.
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
    // And what it skipped to actually holds the page, not the chrome.
    await expect(page.locator("#main").getByRole("heading", { name: "Projects" })).toBeVisible();
  });

  test("signs out from the rail foot", async ({ page }) => {
    const email = `app-shell-out-${Date.now()}@example.test`;
    await signIn(page, email);
    await page.locator(RAIL).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in|\/$/);
    await deleteTestUser(email);
  });
});

test.describe("the app shell on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.afterAll(async () => {
    await deleteTestUser(`app-shell-phone-${EMAIL}`);
  });

  test("puts the rail in a disclosure, operable by keyboard, and nothing scrolls sideways", async ({
    page
  }) => {
    const email = `app-shell-phone-${Date.now()}@example.test`;
    await signIn(page, email);
    const promptId = await newPrompt(page, "Phone");
    await addBlok(page, "context", "Anything.");

    const routes = [
      "/app/projects",
      `/app/pr/${promptId}`,
      `/app/pr/${promptId}/runs`,
      `/app/pr/${promptId}/versions`,
      `/app/pr/${promptId}/deploy`,
      "/app/settings/providers",
      "/app/settings/keys",
      "/app/settings/publishing",
      "/app/account"
    ];

    for (const route of routes) {
      await page.goto(route);
      // EPIC-072's lesson: the site nav put itself 185px past a 390px viewport and every
      // assertion passed. The sweep is over every route, not one.
      await expectNoHorizontalOverflow(page);
      // The desktop column is out of the document, so exactly one rail is in the tree.
      await expect(page.locator(".app-shell-rail")).toBeHidden();
    }

    // `<details>`, so it opens from the keyboard with no JavaScript at all.
    const menu = page.getByRole("group").first();
    await page.getByText("Menu", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("open", "");
    await expect(menu.getByRole("link", { name: "Projects", exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(menu).not.toHaveAttribute("open", "");

    await deleteTestUser(email);
  });

  test("every rail item is a 44px touch target", async ({ page }) => {
    const email = `app-shell-touch-${Date.now()}@example.test`;
    await signIn(page, email);
    await page.getByText("Menu", { exact: true }).click();

    const links = page.locator(".app-shell-menu-body .app-rail-link");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box?.height, `rail item ${index}`).toBeGreaterThanOrEqual(44);
    }

    const summary = await page.getByText("Menu", { exact: true }).boundingBox();
    expect(summary?.height).toBeGreaterThanOrEqual(44);
    await deleteTestUser(email);
  });
});
