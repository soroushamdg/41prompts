import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser, latestMagicLinkTokenFor } from "./db";

/** One sign-in for the file, as the other app specs do — magic links are rate limited per IP. */
const OWNER_EMAIL = `vars-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-vars-")), "owner.json");
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

async function newPrompt(page: Page): Promise<string> {
  await page.goto("/app/projects");
  await page.getByLabel("New project").fill(`Vars ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);
  await page.getByLabel("New prompt").fill("Support reply");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
  return page.url();
}

async function addBlok(page: Page, kind: string, text: string): Promise<void> {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await expect(page.locator(".canvas-list > li")).toHaveCount(before + 1);
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await expect(
    page.locator(".canvas-list > li").nth(before).locator(".blok-editor-state")
  ).toHaveAttribute("data-state", "saved");
  await page.reload();
}

/**
 * The declared variable's own name, and not the four labels that also contain it.
 *
 * `getByText("company")` matches `Default for company`, `What company is for` and
 * `New name for company` as well as the name itself — a strict-mode violation that says the test is
 * ambiguous, not that the page is wrong.
 */
function declaredName(page: Page, name: string) {
  return page
    .getByRole("region", { name: "Declared variables" })
    .locator(".variables-name")
    .filter({ hasText: new RegExp(`^${name}$`) });
}

async function openVariables(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Variables" }).click();
  await expect(page.getByRole("tabpanel", { name: "Variables" })).toBeVisible();
}

test.describe("variables", () => {
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

  test("a used name that nothing declares is reported, and declaring it clears the report", async ({ page }) => {
    await newPrompt(page);
    await addBlok(page, "context", "You are the support assistant for {{company}}.");
    await addBlok(page, "constraint", "Never promise a refund for {{company}}.");

    await openVariables(page);
    const undeclared = page.getByRole("region", { name: "Used but not declared" });
    await expect(undeclared).toBeVisible();
    await expect(undeclared.getByText("company", { exact: true })).toBeVisible();
    // Two bloks use it, and the count is the fact that matters.
    await expect(undeclared.getByText("in 2 places")).toBeVisible();

    await undeclared.getByRole("button", { name: "Declare company" }).click();
    await expect(page.getByRole("region", { name: "Used but not declared" })).toHaveCount(0);
    await expect(declaredName(page, "company")).toBeVisible();
  });

  test("a rename follows into every blok and into the declaration", async ({ page }) => {
    await newPrompt(page);
    await addBlok(page, "context", "You work for {{company}}.");
    await addBlok(page, "constraint", "Never speak for {{company}} without a case id.");

    await openVariables(page);
    await page.getByRole("button", { name: "Declare company" }).click();
    await page.getByRole("button", { name: "Rename" }).first().click();
    await page.getByLabel("New name for company").fill("vendor");
    await page.getByRole("button", { name: "Rename everywhere" }).click();

    await expect(declaredName(page, "vendor")).toBeVisible();
    // Nothing is undeclared afterwards: the texts moved with the row.
    await expect(page.getByRole("region", { name: "Used but not declared" })).toHaveCount(0);

    await page.getByRole("tab", { name: "Editor" }).click();
    await expect(page.locator(".compiled-text")).toContainText("You work for {{vendor}}.");
    await expect(page.locator(".compiled-text")).not.toContainText("{{company}}");
  });

  test("a rename onto a name already in the prompt is refused rather than merging two variables", async ({
    page,
  }) => {
    await newPrompt(page);
    await addBlok(page, "context", "{{company}} and {{region}}.");

    await openVariables(page);
    await page.getByRole("button", { name: "Declare company" }).click();
    await page.getByRole("button", { name: "Rename" }).first().click();
    await page.getByLabel("New name for company").fill("region");
    await page.getByRole("button", { name: "Rename everywhere" }).click();

    await expect(page.getByRole("status")).toContainText("already in this prompt");
    await expect(declaredName(page, "company")).toBeVisible();
  });

  test("preview renders defaults and leaves a required variable visible", async ({ page }) => {
    await newPrompt(page);
    await addBlok(page, "context", "Hello {{customer}}, this is {{company}}.");

    await openVariables(page);
    await page.getByRole("button", { name: "Declare company" }).click();

    // Only `company` gets a default; `customer` stays required and keeps its braces.
    const company = page.getByRole("region", { name: "Declared variables" }).getByRole("listitem").first();
    await company.getByLabel("Has a default, so the caller may leave it out").check();
    await company.getByLabel("Default for company").fill("Acme");
    await company.getByRole("button", { name: "Save" }).click();

    await page.getByRole("button", { name: "Show preview" }).click();
    const preview = page.locator(".variables-preview");
    await expect(preview).toContainText("this is Acme.");
    await expect(preview).toContainText("{{customer}}");
  });

  test("the tab strip works by keyboard, and the tab has no accessibility violations", async ({ page }) => {
    await newPrompt(page);
    await addBlok(page, "context", "For {{company}}.");

    await page.getByRole("tab", { name: "Editor" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Variables" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Editor" })).toHaveAttribute("aria-selected", "true");

    await openVariables(page);
    const results = await new AxeBuilder({ page }).include(".workbench").analyze();
    expect(results.violations).toEqual([]);
  });
});
