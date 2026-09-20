import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { deleteTestUser } from "./db";
import { addBlok, declare, newPrompt, setNamed, signIn, uploadCsv, uploadMessage } from "./runs-helpers";

/**
 * Input sets: what uploads, what is refused, and what the surface says instead.
 *
 * **No worker is needed for any of this.** Every refusal in EPIC-032 decision 1 happens at upload,
 * in the server action, before anything is queued — which is the whole point of the decision, and
 * which is why these assertions do not depend on a provider existing anywhere.
 */

const OWNER_EMAIL = `runs-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-runs-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

test.describe("input sets", () => {
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

  async function promptWithOneVariable(page: import("@playwright/test").Page): Promise<string> {
    const promptId = await newPrompt(page, "Support reply");
    await addBlok(page, "context", "Reply to {{customer}}.");
    await declare(page, "customer");
    return promptId;
  }

  test("a CSV whose header names the variables uploads, and its rows are listed with their count", async ({
    page,
  }) => {
    const promptId = await promptWithOneVariable(page);
    await uploadCsv(page, promptId, "inputs.csv", "customer\nAda\nGrace\n");

    await expect(setNamed(page, "inputs.csv")).toBeVisible();
    await expect(page.getByText("2 inputs · customer")).toBeVisible();
  });

  test("a column matching no variable is refused at upload, naming it, and nothing is stored", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await uploadCsv(page, promptId, "wrong.csv", "customer,urgency\nAda,high\n");

    const message = uploadMessage(page);
    await expect(message).toContainText("urgency");
    await expect(message).toContainText("Nothing was saved");
    // The rows are not stored: the list is still empty.
    await expect(setNamed(page, "wrong.csv")).toHaveCount(0);
    await expect(page.getByText("No inputs yet.")).toBeVisible();
  });

  test("a missing required variable is refused, and a missing optional one is accepted", async ({ page }) => {
    const promptId = await newPrompt(page, "Two variables");
    await addBlok(page, "context", "Reply to {{customer}} in a {{tone}} tone.");
    await declare(page, "customer");
    await declare(page, "tone");

    // `tone` gets a default, which is what makes it optional (there is no `optional` column —
    // `isOptional()` asks the question of `defaultValue`).
    const toneRow = page
      .getByRole("region", { name: "Declared variables" })
      .getByRole("listitem")
      .filter({ hasText: "tone" })
      .first();
    await toneRow.getByLabel("Has a default, so the caller may leave it out").check();
    await toneRow.getByLabel("Default for tone").fill("neutral");
    await toneRow.getByRole("button", { name: "Save" }).click();

    await uploadCsv(page, promptId, "missing-required.csv", "tone\nwarm\n");
    await expect(uploadMessage(page)).toContainText("customer");

    await uploadCsv(page, promptId, "missing-optional.csv", "customer\nAda\n");
    await expect(setNamed(page, "missing-optional.csv")).toBeVisible();
  });

  test("a prompt with no declared variables says so instead of offering a file input", async ({ page }) => {
    const promptId = await newPrompt(page, "No variables");
    await addBlok(page, "context", "Answer the question.");

    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(page.getByTestId("no-variables")).toContainText("declares no variables");
    // Not offered and then refused: offering it would read as a bug rather than as a thing to do.
    await expect(page.getByLabel("CSV file")).toHaveCount(0);
  });

  test("a CSV we cannot read is refused with the line it went wrong on", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await uploadCsv(page, promptId, "ragged.csv", "customer\nAda\nGrace,extra\n");
    await expect(uploadMessage(page)).toContainText("Line 3");
  });

  test("an uploaded set can be removed", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await uploadCsv(page, promptId, "inputs.csv", "customer\nAda\n");
    await expect(setNamed(page, "inputs.csv")).toBeVisible();

    await page.getByRole("button", { name: "Remove inputs.csv" }).click();
    await expect(page.getByText("No inputs yet.")).toBeVisible();
  });

  test("run history is empty until something has been run", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(page.getByRole("region", { name: "Run history" })).toContainText("Nothing has been run yet");
  });

  test("the prompt page offers a way to reach the runs page", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await page.goto(`/app/pr/${promptId}`);
    // Scoped to the page, and `exact`. EPIC-023 added two more ways to reach Runs — the rail's item
    // and the top bar's `Run suite` — so a loose name now matches three links. What this test is
    // about is the page offering one of its own, which is still true.
    await page.getByRole("main").getByRole("link", { name: "Run", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pr/${promptId}/runs$`));
  });

  test("works by keyboard and at 390px, with no accessibility violations", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await uploadCsv(page, promptId, "inputs.csv", "customer\nAda\n");

    // Rule 12: the whole of the page reachable without a mouse, in the order it reads.
    //
    // **EPIC-032a inserted a control here**, and this assertion is the reason that was noticed:
    // "add inputs by hand" sits between the upload form and the list of sets, which is where it
    // reads and therefore where it belongs in the tab order. The step below is the new control,
    // not a workaround for it — a Tab walk that skipped it would stop describing the page.
    await page.getByLabel("CSV file").focus();
    await expect(page.getByLabel("CSV file")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Upload" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "add inputs by hand" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Run inputs.csv" })).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Run inputs.csv" })).toBeVisible();

    const results = await new AxeBuilder({ page }).include("main").analyze();
    expect(results.violations).toEqual([]);
  });
});
