import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("save a key, run once on it, export everything, delete the account", async ({ page }) => {
  await signIn(page, uniqueEmail("settings"));

  await page.goto("/settings#keys");
  await page.getByLabel("OpenAI API key").fill("sk-bad-key-for-test");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await expect(page.getByText("OpenAI refused that key. Check it and try again.")).toBeVisible();
  await page.getByLabel("OpenAI API key").fill("sk-proj-good-key-3f9a");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await expect(page.getByText(/Key ending 3f9a · added/)).toBeVisible();
  expect(await page.content()).not.toContain("good-key");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Works · 212 ms")).toBeVisible();

  await page.goto("/new");
  await page.getByLabel("Your prompt").fill("You are a support agent for {{shop}}.");
  await page.getByLabel("Name").fill("run-check");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/p\/run-check$/);
  await page.getByRole("tab", { name: "Run" }).click();
  await expect(page.getByText("{{shop}} has no value yet")).toBeVisible();
  await expect(page.getByRole("option", { name: "Google Gemini · Gemini 3.8 Flash" })).toBeDisabled();
  await page.getByLabel("Test message").fill("Where is my order?");
  await page.getByRole("button", { name: "Run once" }).click();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Hi Sam, I am sorry your order has not shipped yet\./)).toBeVisible();
  await expect(page.locator('[class*="runstats"]')).toContainText(/Tokens \d+.*Time [\d,]+ ms.*Cost \$0\.\d+/);

  await page.goto("/settings#data");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^41prompts-export-\d{4}-\d{2}-\d{2}\.zip$/);
  const zip = unzipSync(readFileSync((await download.path())!));
  expect(Object.keys(zip)).toEqual(expect.arrayContaining(["41prompts/library.json", "41prompts/run-check/run-check.md", "41prompts/run-check/run-check.json"]));
  expect(strFromU8(zip["41prompts/run-check/run-check.md"]!)).toContain("You are a support agent for {{shop}}.");

  await page.getByLabel("Type DELETE to confirm").fill("delete");
  await expect(page.getByRole("button", { name: "Delete account" })).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/goodbye/);
  await expect(page.getByRole("heading", { name: "Your account is deleted." })).toBeVisible();
  await expect(page.getByText("We removed your account, 1 prompt, 1 version and 1 saved model key.")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("checkout and portal do not exist while pricing is off", async ({ request }) => {
  expect((await request.post("/api/stripe/checkout")).status()).toBe(404);
  expect((await request.post("/api/stripe/portal")).status()).toBe(404);
});
