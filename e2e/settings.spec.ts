import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("add a model, duplicate it, run once, export everything, delete the account", async ({ page }) => {
  await signIn(page, uniqueEmail("settings"));
  await expect(page.getByText("No models yet. Add one to run prompts on your own account.")).toBeVisible();

  await page.goto("/settings#models");
  await expect(page.getByText("No models yet. Add one to run prompts on your own account.")).toBeVisible();
  await page.getByRole("button", { name: "Add model" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Search providers").fill("open");
  await expect(dlg.getByRole("button", { name: /^Anthropic\b/ })).toHaveCount(0);
  await dlg.getByRole("button", { name: /^OpenAI\b/ }).click();
  await expect(dlg.getByLabel("Label")).toHaveValue("OpenAI");
  await dlg.getByLabel("Label").fill("Work GPT");
  await dlg.getByLabel("API key").fill("sk-bad-key-for-test");
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await expect(dlg.getByText("OpenAI refused that key. Check it and try again.")).toBeVisible();
  await dlg.getByLabel("API key").fill("sk-proj-good-key-3f9a");
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await expect(dlg.getByText(/Connected · 212 ms · 3 models/)).toBeVisible();
  await dlg.getByRole("combobox", { name: "Model" }).click();
  await dlg.getByRole("option", { name: /gpt-6\.1-sol/ }).click();
  await expect(dlg.getByLabel("Input")).toHaveValue("2");
  await expect(dlg.getByLabel("Output")).toHaveValue("10");
  await dlg.getByRole("button", { name: "Save model" }).click();
  await expect(page.getByText("Added Work GPT.")).toBeVisible();
  const row = page.locator('[data-model="Work GPT"]');
  await expect(row).toContainText("key ending 3f9a");
  await expect(row).toContainText("Works · 212 ms");
  expect(await page.content()).not.toContain("good-key");

  // Duplicate keeps the key without typing it again; the copy gets its own model.
  await page.getByRole("button", { name: "Duplicate Work GPT" }).click();
  await expect(dlg.getByLabel("Label")).toHaveValue("Work GPT (copy)");
  await expect(dlg.getByText("Copied from Work GPT · ends 3f9a")).toBeVisible();
  await dlg.getByLabel("Label").fill("Cheap GPT");
  await dlg.getByRole("combobox", { name: "Model" }).fill("gpt-6-luna");
  await dlg.getByRole("button", { name: "Save model" }).click();
  await expect(page.getByText("Added Cheap GPT.")).toBeVisible();
  await expect(page.locator('[data-model="Cheap GPT"]')).toContainText("gpt-6-luna");

  // Labels are unique.
  await page.getByRole("button", { name: "Edit Cheap GPT" }).click();
  await dlg.getByLabel("Label").fill("work gpt");
  await dlg.getByRole("button", { name: "Save changes" }).click();
  await expect(dlg.getByText("You already have a model with this label. Pick another one.")).toBeVisible();
  await dlg.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Test Cheap GPT" }).click();
  await expect(page.locator('[data-model="Cheap GPT"]')).toContainText("Works · 212 ms");

  await page.goto("/new");
  await page.getByLabel("Your prompt").fill("You are a support agent for {{shop}}.");
  await page.getByLabel("Name").fill("run-check");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/p\/run-check$/);
  await page.getByRole("tab", { name: "Run" }).click();
  await expect(page.getByText("{{shop}} has no value yet")).toBeVisible();
  await page.getByLabel(/^Model/).selectOption({ label: "Cheap GPT · gpt-6-luna" });
  await expect(page.getByText(/Runs on our server with your OpenAI key ending 3f9a/)).toBeVisible();
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
  await expect(page.getByText("We removed your account, 1 prompt, 1 version and 2 saved models.")).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("old links to #keys and the add link open the models section", async ({ page }) => {
  await signIn(page, uniqueEmail("models-link"));
  await page.goto("/settings?add=1#models");
  await expect(page.getByRole("heading", { name: "Add a model" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/settings#models$/);
  await page.goto("/settings#keys");
  await expect(page.getByRole("heading", { name: "Models" })).toBeInViewport();
});

test("checkout and portal do not exist while pricing is off", async ({ request }) => {
  expect((await request.post("/api/stripe/checkout")).status()).toBe(404);
  expect((await request.post("/api/stripe/portal")).status()).toBe(404);
});
