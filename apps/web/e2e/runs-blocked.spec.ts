import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { addBlok, newPrompt, signIn } from "./runs-helpers";

/**
 * The Runs page's blocked banner (EPIC-055 C15).
 *
 * **Both directions, in one file, because only one of them is worth anything on its own.** A banner
 * that never renders passes the negative test; a banner that always renders passes the positive one.
 * The pair is the assertion.
 */

const OWNER_EMAIL = `blocked-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-blocked-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

const banner = (page: Page) => page.locator(".runs-blocked");

test.describe("the Runs page says when Live is blocked", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(await context.newPage(), OWNER_EMAIL);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    await deleteTestUser(OWNER_EMAIL);
  });

  test.use({ storageState: STATE_FILE });

  test("is absent when nothing is stopping a publish", async ({ page }) => {
    const promptId = await newPrompt(page, "Unblocked");
    await addBlok(page, "context", "You triage inbound support email.");

    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(page.getByRole("heading", { name: "Runs" })).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
  });

  test("appears, names the reason, and links to Deploy once the contract is broken", async ({ page }) => {
    const promptId = await newPrompt(page, "Blocked");
    await addBlok(page, "context", "You triage inbound support email.");

    // Publish, so there is something in the field for the next version to break.
    await page.goto(`/app/pr/${promptId}/deploy`);
    await page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ }).click();
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText("Live v1");

    // The control, taken here rather than assumed: with a publish done and nothing broken, the
    // banner is still absent. So its appearance below is caused by the break and not by publishing.
    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(banner(page)).toHaveCount(0);

    // Require an input the shipped version did not: `added_required`, a blocking break.
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "context", "Address {{customer_name}} by name.");
    await page.getByRole("tab", { name: "Variables" }).click();
    await page.getByRole("button", { name: "Declare customer_name" }).click();
    await expect(
      page.getByRole("region", { name: "Declared variables" }).getByText("customer_name", { exact: true }),
    ).toBeVisible();

    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText("This cannot go Live yet");
    await expect(banner(page)).toContainText("This would stop working for apps already in the field.");

    await banner(page).getByRole("link", { name: "Open Deploy" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pr/${promptId}/deploy$`));
    await expect(page.locator(".deploy-gatestate-stopped")).toBeVisible();
  });
});
