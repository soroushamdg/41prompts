import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

const PASTE = `You are a support agent for Northwind Outfitters.

Reply in under 80 words. Greet the customer as {{customer_name}}.

Customer: My boots arrived in the wrong size.`;

async function newPrompt(page: Page, name: string, text = PASTE) {
  await page.goto("/new");
  await page.getByLabel("Your prompt").fill(text);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${name}$`));
}

const ids = (page: Page) => page.locator(".blok").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")).join());
const saved = (page: Page) => expect(page.getByRole("status").filter({ hasText: /^Saved · v\d+$/ })).toBeVisible({ timeout: 15_000 });

test("shape a pasted prompt into typed bloks; the compiled prompt follows", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, uniqueEmail("editor"));
  await newPrompt(page, "support-reply");
  await expect(page.locator(".blok")).toHaveCount(1);

  await page.getByRole("button", { name: "Split blok B1 at the cursor" }).click();
  await page.getByRole("button", { name: "Split blok B2 at the cursor" }).click();
  await expect(page.locator(".blok")).toHaveCount(3);
  await page.getByRole("button", { name: /Change the type of blok B2/ }).click();
  await page.getByRole("menuitemradio", { name: "Constraint" }).click();
  await expect(page.locator('.blok[data-id="B2"]')).toHaveAttribute("data-type", "constraint");

  await page.locator('[data-add="expects"]').click();
  await page.keyboard.type("Never promises a refund.");
  await saved(page);
  await expect(page.getByLabel("Compiled prompt")).not.toContainText("refund");
  await expect(page.getByText("4 bloks · 1 variable")).toBeVisible();

  await page.getByLabel("Variable · customer_name").fill("Sam");
  await page.getByRole("button", { name: "Filled" }).click();
  await expect(page.getByLabel("Compiled prompt")).toContainText("Greet the customer as Sam.");
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Greet the customer as Sam.");
  await page.getByRole("button", { name: "Copy as JSON" }).click();
  await expect(page.getByText("Copied as JSON.")).toBeVisible();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))).toMatchObject({ name: "support-reply", bloks: [{ id: "B1" }, { id: "B2", type: "constraint" }, { id: "B3" }, { id: "B4", type: "expects" }] });

  // Reorder with the keyboard and announce it.
  await page.locator('[data-grip="B3"]').focus();
  await page.keyboard.press("ArrowUp");
  expect(await ids(page)).toBe("B1,B3,B2,B4");
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: "Blok B3 moved to position 2 of 4." })).toBeAttached();

  // Delete with undo.
  await page.getByRole("button", { name: "Delete blok B4" }).click();
  await expect(page.locator('.blok[data-id="B4"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('.blok[data-id="B4"]')).toHaveCount(1);
  await saved(page);

  // Everything survives a reload.
  await page.reload();
  expect(await ids(page)).toBe("B1,B3,B2,B4");
  await expect(page.getByLabel("Variable · customer_name")).toHaveValue("Sam");
});

test("every save is a version; restoring adds one and overwrites nothing", async ({ page }) => {
  await signIn(page, uniqueEmail("history"));
  await newPrompt(page, "history-check", "First draft.");
  const text = page.getByRole("textbox", { name: "Text of blok B1" });
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Second thought.");
  await saved(page);
  await page.getByRole("tab", { name: /History/ }).click();
  await expect(page.getByText("Edited B1")).toBeVisible();

  await page.getByRole("button", { name: "Open v1 read-only" }).click();
  await expect(page.getByText("Viewing v1 · read-only")).toBeVisible();
  await expect(page.getByLabel("Compiled prompt")).toHaveText(/First draft\.$/);
  await page.getByRole("button", { name: "Restore v1" }).click();
  await expect(page.getByText("Restored v1 as v3. Nothing was overwritten.")).toBeVisible();
  await expect(page.getByText("Restored v1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Name this version" }).click();
  await page.getByLabel("Version name").fill("works on Claude");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Named v3 “works on Claude”.")).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: /History · 3/ }).click();
  await expect(page.getByText("works on Claude")).toBeVisible();
});

test("typed text survives a closed tab through the local draft", async ({ page }) => {
  await signIn(page, uniqueEmail("draft"));
  await newPrompt(page, "draft-check", "Keep this.");
  await page.route("**/api/prompts/*/versions", (route) => route.abort());
  const text = page.getByRole("textbox", { name: "Text of blok B1" });
  await text.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed offline.");
  await expect(page.getByText("Not saved · retrying")).toBeVisible({ timeout: 15_000 });
  // The tab closes before the server ever got the change.
  await page.reload();
  await expect(page.getByText(/Unsaved changes from .* were kept on this device\./)).toBeVisible();
  await page.unroute("**/api/prompts/*/versions");
  await page.getByRole("button", { name: "Restore them" }).click();
  await expect(page.getByRole("textbox", { name: "Text of blok B1" })).toHaveText("Keep this. Typed offline.");
  await saved(page);
});

test("Performance tools in the editor are locked and say so", async ({ page }) => {
  await signIn(page, uniqueEmail("perf"));
  await newPrompt(page, "perf-check");
  await page.getByRole("toolbar", { name: "Performance tools" }).getByRole("button", { name: "Lint" }).click();
  await expect(page.getByRole("heading", { name: "The linter is part of Performance." })).toBeVisible();
});
