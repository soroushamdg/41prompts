import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshot capture for the epic report. **Not a visual-regression suite.**
 *
 * EPIC-003's `toHaveScreenshot` baselines were generated inside a Linux container to match CI, and
 * this machine is macOS; adding baselines here would commit images CI cannot reproduce. The epic
 * asks for screenshots as *evidence in the report*, and that is exactly what these are — run on
 * demand with `--grep @capture`, never in the normal suite.
 */

const MESSY = [
  "You are an AI language model acting as a support assistant. Please be helpful.",
  "",
  "Rules:",
  "1. Always classify the email into one of these categories: billing, technical, other.",
  "2. Always respond in JSON only.",
  "3. Keep the summary reasonably short.",
  "4. Never mention that you are an AI model.",
  "",
  "The JSON should have these fields: category, summary, needs_human.",
  "",
  "Thank you!",
  ""
].join("\n");

const CROSS_KIND = [
  "You are a support assistant. You should always be professional and friendly.",
  "",
  "Rules:",
  "1. Classify the email into one of the categories.",
  "2. Always be professional and friendly in the summary field.",
  ""
].join("\n");

async function run(page: Page, prompt: string) {
  await page.goto("/decompile");
  await page.getByLabel("Your prompt").fill(prompt);
  await page.getByRole("button", { name: "Decompile" }).click();
  await expect(page.getByTestId("source-map")).toBeVisible();
}

const DIR = "docs/epics/reports/screenshots/EPIC-013";

test.describe("@capture", () => {
  test("empty state", async ({ page }) => {
    await page.goto("/decompile");
    await page.screenshot({ path: `${DIR}/01-empty-state.png`, fullPage: true });
  });

  test("result, light", async ({ page }) => {
    await run(page, MESSY);
    await page.locator(".blok-card").filter({ hasText: /JSON/ }).first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/02-result-light.png`, fullPage: true });
  });

  test("result, dark", async ({ page }) => {
    await run(page, MESSY);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.locator(".blok-card").filter({ hasText: /JSON/ }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/03-result-dark.png`, fullPage: true });
  });

  test("findings panel with the closing section", async ({ page }) => {
    await run(page, MESSY);
    await page.locator(".findings").scrollIntoViewIfNeeded();
    await page.locator(".findings").screenshot({ path: `${DIR}/04-findings-closing-section.png` });
  });

  test("a repeated finding across two kinds", async ({ page }) => {
    await run(page, CROSS_KIND);
    const repeated = page.locator(".finding").filter({ hasText: "say the same thing" }).first();
    await expect(repeated).toBeVisible();
    await repeated.screenshot({ path: `${DIR}/05-repeated-shows-both-kinds.png` });
  });

  test("blok card with its summary source", async ({ page }) => {
    await run(page, MESSY);
    await page.locator(".blok-card").first().screenshot({ path: `${DIR}/06-blok-card-summary-source.png` });
  });

  test("phone width, first blok pinned", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await run(page, MESSY);
    await page.locator(".source-span").first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${DIR}/07-phone-pinned.png`, fullPage: true });
  });

  test("over the limit", async ({ page }) => {
    await page.goto("/decompile");
    await page.getByLabel("Your prompt").fill("x".repeat(102_401));
    await page.getByRole("button", { name: "Decompile" }).click();
    await expect(page.locator(".decompile-notice")).toBeVisible();
    await page.screenshot({ path: `${DIR}/08-over-the-limit.png` });
  });
});
