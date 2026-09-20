import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { deleteTestUser } from "./db";
import { newPrompt, signIn } from "./runs-helpers";
import { startWorker, type RunningWorker } from "./worker-process";

/**
 * Signup to a first passing run, timed (EPIC-034).
 *
 * ## What the clock measures, and what it deliberately excludes
 *
 * The budget is the roadmap's own: **five minutes from signup to a first passing run.** What is
 * timed here is the *journey* — the first click after signing in, through to the passing run — and
 * not the suite. A Playwright run includes a production build and a browser start, neither of which
 * a person waits for, and timing those would measure this machine rather than the product.
 *
 * ## What it cannot prove
 *
 * The provider is faked, so the second run passes because the prompt was fixed and the fake echoes
 * the last line of it. **On deployed staging there is no provider key at all**, so a real person
 * cannot reach a passing run in any amount of time. That is EPIC-031a's, and it is written at the
 * top of this epic's file rather than discovered here.
 */

const OWNER_EMAIL = `activation-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-activation-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

const BUDGET_SECONDS = 5 * 60;
const APOLOGY = `Open every reply with "i'm sorry for the trouble".`;
const FIXED = 'Open every reply with "thanks for writing in".';

let worker: RunningWorker;

test.describe("activation", () => {
  test.beforeAll(async ({ browser }) => {
    worker = await startWorker({ FAKE_PROVIDER: "1" });
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

  test("signup to a first passing run, inside five minutes", async ({ page }) => {
    const startedAt = Date.now();

    // 1 — the offer, beside the empty state.
    await page.goto("/app/projects");
    await expect(page.getByText("No projects yet.")).toBeVisible();
    const offer = page.getByRole("region", { name: "Start from an example" });
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Start from an example" }).click();

    // 2 — it lands on the runs page, ready to press Run, with the input set already there.
    await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}\/runs$/);
    const promptId = page.url().split("/app/pr/")[1]!.split("/")[0]!;
    await expect(page.locator(".runs-set-name")).toHaveCount(1);

    const progress = page.getByRole("region", { name: "Getting started" });
    await expect(progress).toContainText("1 of 4");

    // 3 — run it. The prompt contradicts itself, so this fails.
    await page.getByRole("button", { name: /^Run / }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });
    await expect(page.locator(".runs-headline")).toContainText("not verified");

    // 4 — the failure names the rule, and the progress follows the rows.
    await page.getByRole("button", { name: "Show failure" }).click();
    await expect(page.getByTestId("failure-detail")).toContainText('Never mention "sorry".');
    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(progress).toContainText("3 of 4");

    // **A finished run whose check failed is not decorated with a pass tick.** EPIC-032's history
    // row showed one for any run that reached `done` without a refusal, on a product whose whole
    // argument is that it tells you when something failed.
    const firstRow = page.locator(".runs-history li").first();
    await expect(firstRow.locator(".status-icon")).toHaveText("✕");

    // 5 — fix the blok that tells it to apologise. The real fix, on the canvas.
    await page.goto(`/app/pr/${promptId}`);
    // **Resolved to an index before the edit, not filtered by its text.** A `filter({ hasText })`
    // locator is re-evaluated on every use, so the moment the text is replaced it matches nothing
    // and every assertion after it fails looking for a row that is still there.
    const rows = page.locator(".canvas-list > li");
    // The example arrived whole: one transaction, four bloks, nothing half-made.
    await expect(rows).toHaveCount(4);
    await expect(page.locator(".canvas-list")).toContainText(APOLOGY.slice(0, 24));
    // **Scanned by what the cards say, not by what their fields hold** (EPIC-024). A compact card
    // shows its text at rest and opens on selection, so a fresh page has no fields to read at all —
    // and this is how a person finds the card anyway: by reading the canvas.
    const summaries = await rows.allInnerTexts();
    let apologyIndex = -1;
    for (const [index, text] of summaries.entries()) {
      if (text.includes("i'm sorry for the trouble")) apologyIndex = index;
    }
    expect(apologyIndex).toBeGreaterThanOrEqual(0);

    const apology = rows.nth(apologyIndex);
    await apology.getByRole("button", { name: /^Edit this blok/ }).click();
    await apology.getByLabel("Blok text").fill(FIXED);
    await expect(apology.locator(".blok-editor-state")).toHaveAttribute("data-state", "saved");

    // 6 — run again. It passes.
    await page.goto(`/app/pr/${promptId}/runs`);
    await page.getByRole("button", { name: /^Run / }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".runs-headline")).toContainText("Every check ran, and every one passed.", {
      timeout: 60_000,
    });

    const seconds = (Date.now() - startedAt) / 1000;
    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(progress).toContainText("4 of 4");
    // And the newest row now earns its tick.
    await expect(page.locator(".runs-history li").first().locator(".status-icon")).toHaveText("✓");

    // The roadmap's number. Reported as well as asserted, because a journey that crept to four
    // minutes would still pass and would still be worth knowing about.
    console.log(`[activation] signup to first passing run: ${seconds.toFixed(1)}s of ${BUDGET_SECONDS}s`);
    expect(seconds).toBeLessThan(BUDGET_SECONDS);
  });

  /**
   * **The other half of decision 1**, and the one that would regress quietly.
   *
   * Soroush ruled that a prompt somebody makes is not pre-filled with fabricated content. The
   * example is an opt-in act; creating a prompt by hand is not, and it still produces nothing.
   */
  test("a prompt made by hand is still empty", async ({ page }) => {
    await newPrompt(page, "Mine");
    await expect(page.locator(".canvas-list > li")).toHaveCount(0);
    // And no onboarding checklist on somebody's own prompt.
    await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
  });

  /**
   * **The offer is for somebody who has nothing, and goes away when they do not.**
   *
   * It sits beside the empty state (decision 1), so a person with a project of their own is never
   * offered fabricated content again — and the onboarding does not keep talking to a user it
   * already has. The timed test above leaves this account with a project, which is what makes this
   * the right place to assert it.
   */
  test("the offer is gone once there is a project of your own", async ({ page }) => {
    await page.goto("/app/projects");
    await expect(page.getByText("No projects yet.")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Start from an example" })).toHaveCount(0);
  });
});
