import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser, latestMagicLinkTokenFor } from "./db";

/**
 * Screenshots for EPIC-021a's report. Not assertions — this file exists to produce the images the
 * criterion asks for, the way `capture.spec.ts` does for EPIC-013.
 *
 * **These are taken against a local build, and the report says so.** The criterion asks for staging,
 * and the deploy itself is verified there — but signing in to staging needs a magic link, and
 * `lib/email.ts` deliberately never logs the address or the link (ACCESS.md rule 7). That makes the
 * signed-in half a human step, exactly as EPIC-016 recorded for OAuth sign-in. Reported rather than
 * worked around: the design that blocks this is the correct design.
 */
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };
const OUT = "docs/epics/reports/screenshots/EPIC-021a";

const EMAIL = `canvas-shots-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-shots-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?next=%2Fapp%2Fprojects");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const token = await latestMagicLinkTokenFor(email);
  await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
  await expect(page).toHaveURL(/\/app\/projects/);
}

test.describe("EPIC-021a screenshots", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(await context.newPage(), EMAIL);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    await deleteTestUser(EMAIL);
  });

  test.describe("signed in", () => {
    test.use({ storageState: STATE_FILE });

    test("captures the canvas at both viewports, in both themes", async ({ page }) => {
      test.slow();
      await page.setViewportSize(LAPTOP);
      await page.goto("/app/projects");
      await page.getByLabel("New project").fill("Support ops");
      await page.getByRole("button", { name: "Create project" }).click();
      await expect(page).toHaveURL(/\/app\/p\/proj_/);
      await page.screenshot({ path: `${OUT}/01-project-empty.png`, fullPage: true });

      await page.getByLabel("New prompt").fill("Refund classifier");
      await page.getByRole("button", { name: "Create prompt" }).click();
      await expect(page).toHaveURL(/\/app\/pr\/pr_/);
      await page.screenshot({ path: `${OUT}/02-canvas-empty.png`, fullPage: true });

      const bloks: [string, string][] = [
        ["context", "You are a support operations assistant for a subscription software company. You classify inbound refund requests."],
        ["constraint", "Respond only with a JSON object. No prose before or after."],
        ["constraint", "Fields: category (billing_error | dissatisfied | duplicate | fraud | out_of_policy), confidence (0-1), reason (max 20 words)."],
        ["example", 'Input: "charged twice for March"\nOutput: {"category":"duplicate","confidence":0.94}'],
        ["expected", "Output must parse as valid JSON with exactly three keys."]
      ];
      for (const [kind, text] of bloks) {
        const before = await page.locator(".canvas-list > li").count();
        await page.getByRole("button", { name: `Add ${kind}` }).click();
        await expect(page.locator(".canvas-list > li")).toHaveCount(before + 1);
        await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
        await expect(
          page.locator(".canvas-list > li").nth(before).locator(".blok-editor-state")
        ).toHaveAttribute("data-state", "saved");
      }

      // Mouse and focus away from the cards, so this is genuinely the rest state: no hover shadow,
      // no focus ring, and no category colour anywhere. The first capture had the pointer still
      // resting on the last card it typed into, which is the one thing this shot is meant to show
      // the absence of.
      await page.mouse.move(0, 0);
      await page.locator("h1").click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/03-canvas-1280-light.png`, fullPage: true });

      // Hovered, so the category colour is visible — it exists only during interaction.
      await page.locator(".blok-card").nth(1).hover();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/04-canvas-1280-light-hover.png`, fullPage: true });

      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/05-canvas-1280-dark.png`, fullPage: true });

      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      await page.waitForTimeout(400);
      await page.setViewportSize(PHONE);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${OUT}/06-canvas-375-light.png`, fullPage: true });

      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/07-canvas-375-dark.png`, fullPage: true });
    });
  });
});
