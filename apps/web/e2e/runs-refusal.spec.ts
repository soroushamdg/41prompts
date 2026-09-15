import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { deleteTestUser } from "./db";
import { addBlok, declare, newPrompt, signIn, uploadCsv } from "./runs-helpers";
import { startWorker, type RunningWorker } from "./worker-process";

/**
 * A run with **no provider configured** — the state deployed staging is in while EPIC-031a is
 * deferred.
 *
 * It must produce a refusal with its reason **named in words**: not a crash, not an empty page, and
 * not a spinner that never ends. That third one is the failure this spec really guards, because it
 * is the one that looks like patience.
 *
 * The worker is started here, for this file, with neither a key nor the fake — which is the only
 * way both this and `runs-results.spec.ts` can be true in one suite.
 */

const OWNER_EMAIL = `runs-refusal-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-refusal-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

let worker: RunningWorker;

test.describe("a run with no provider", () => {
  test.beforeAll(async ({ browser }) => {
    worker = await startWorker({ ANTHROPIC_API_KEY: "", FAKE_PROVIDER: "" });
    const context = await browser.newContext();
    await signIn(await context.newPage(), OWNER_EMAIL);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    await worker?.stop();
    await deleteTestUser(OWNER_EMAIL);
  });

  test.use({ storageState: STATE_FILE });

  test("is refused, and the page says why in words", async ({ page }) => {
    const promptId = await newPrompt(page, "Refusal");
    await addBlok(page, "context", "Reply to {{customer}}.");
    await declare(page, "customer");
    await uploadCsv(page, promptId, "inputs.csv", "customer\nAda\n");

    await page.getByRole("button", { name: "Run inputs.csv" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);

    const state = page.locator(".app-state");
    // It gets there by itself — no reload between the trigger and this assertion.
    await expect(state).toContainText("Refused", { timeout: 30_000 });
    await expect(state).toContainText("no model provider is configured");
    // Not a spinner: the progress line is gone because the run reached a terminal state.
    await expect(page.getByTestId("progress")).toHaveCount(0);
  });

  test("is legible as refused in the run history", async ({ page }) => {
    const promptId = await newPrompt(page, "Refusal history");
    await addBlok(page, "context", "Reply to {{customer}}.");
    await declare(page, "customer");
    await uploadCsv(page, promptId, "inputs.csv", "customer\nAda\n");
    await page.getByRole("button", { name: "Run inputs.csv" }).click();
    await expect(page.locator(".app-state")).toContainText("Refused", { timeout: 30_000 });

    await page.goto(`/app/pr/${promptId}/runs`);
    const history = page.getByRole("region", { name: "Run history" });
    await expect(history.getByText(/Refused/)).toBeVisible();
    await expect(history.getByText(/no model provider is configured/)).toBeVisible();
  });
});
