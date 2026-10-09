import { expect, test } from "@playwright/test";
import pg from "pg";
import { signIn, uniqueEmail } from "./helpers";

/* The Product Hunt review prompt shows after a finished run for an account
   that is not brand new, offers later and never, and respects never. */

async function ageAccount(email: string) {
  const c = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await c.connect();
  await c.query(`update "user" set created_at = now() - interval '2 days' where email = $1`, [email]);
  await c.end();
}

test("asks for a review after a run, and never again once told so", async ({ page }) => {
  const email = uniqueEmail("review");
  await signIn(page, email);
  await ageAccount(email);
  await page.goto("/settings#keys");
  await page.getByLabel("OpenAI API key").fill("sk-proj-good-key-1111");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await expect(page.getByText(/Key ending 1111/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Product Hunt/ })).toHaveAttribute("href", /producthunt\.com\/products\/41prompts\/reviews\/new/);

  await page.goto("/new");
  await page.getByLabel("Your prompt").fill("You are a helpful assistant.");
  await page.getByLabel("Name").fill("review-check");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByLabel("Test message").fill("Hello");
  await page.getByRole("button", { name: "Run once" }).click();
  await expect(page.getByRole("heading", { name: "Is 41prompts working for you?" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("dialog[open] a[href*='producthunt.com']")).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "Never ask me again" }).click();
  await expect(page.getByText("Understood. We will not ask again.")).toBeVisible();

  await page.reload();
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByLabel("Test message").fill("Hello again");
  await page.getByRole("button", { name: "Run once" }).click();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  await expect(page.getByRole("heading", { name: "Is 41prompts working for you?" })).toHaveCount(0);
});

test("a brand new account is not asked yet", async ({ page }) => {
  await signIn(page, uniqueEmail("review-new"));
  await page.goto("/settings#keys");
  await page.getByLabel("OpenAI API key").fill("sk-proj-good-key-2222");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await page.goto("/new");
  await page.getByLabel("Your prompt").fill("You are a helpful assistant.");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByLabel("Test message").fill("Hello");
  await page.getByRole("button", { name: "Run once" }).click();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  await expect(page.getByRole("heading", { name: "Is 41prompts working for you?" })).toHaveCount(0);
});
