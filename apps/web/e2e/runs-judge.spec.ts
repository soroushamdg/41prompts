import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { addBlok, declare, newPrompt, signIn, uploadCsv } from "./runs-helpers";
import { startWorker, type RunningWorker } from "./worker-process";

/**
 * The LLM judge (EPIC-033), end to end.
 *
 * ## What this proves, and what it deliberately does not
 *
 * The judge is faked. So what is asserted here is the **pipeline**: a `refuses_to_answer` check
 * reaches the judge rather than sitting un-graded for ever, the verdict maps to an outcome, the
 * rationale is stored and rendered and attributed, and the judge's spend is counted apart from the
 * run's. It asserts nothing about a model being good at recognising refusals, and the report says
 * so rather than letting a green suite imply it.
 *
 * ## How a verdict is chosen from a CSV
 *
 * The prompt ends with `{{answer}}` and the model fake echoes the last non-empty line, so the
 * model's reply is the CSV cell. The judge fake answers `REFUSED` when that reply carries
 * `<<refuses>>` — an explicit token, not a phrase list, because a fake that recognised "I cannot"
 * would be the very heuristic this epic exists to replace, and the suite would then be proving the
 * judge works by consulting it.
 */

const OWNER_EMAIL = `runs-judge-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-judge-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

let worker: RunningWorker;

/**
 * One input refuses, one answers, so a single run carries both verdicts.
 *
 * **The marker goes in the CSV, not in a context blok**, and that is not a detail. A judge call is a
 * run, so it is cached on its content — and its content is the rubric and the model's reply, neither
 * of which changes when a context blok does. A marker anywhere else leaves every test after the
 * first judging nothing and reading a cached verdict, which is the cache behaving exactly as
 * EPIC-031 decision 5 specifies and is not what these tests are for.
 */
function csvFor(marker: string): string {
  return `answer\n<<refuses>> I can't help with pricing. ${marker}\nPricing starts at $10 a seat. ${marker}\n`;
}

test.describe("the judge", () => {
  test.beforeAll(async ({ browser }) => {
    worker = await startWorker({ FAKE_PROVIDER: "1", FAKE_JUDGE: "1" });
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

  /**
   * `marker` makes this prompt's compiled text unique. `cacheKey` is content-keyed, so without it
   * the second test in this file is answered by the first test's cache and judges nobody —
   * EPIC-032's cost test learned this the same way.
   */
  async function promptThatMustRefuse(page: Page, marker: string): Promise<string> {
    const promptId = await newPrompt(page, "Support");
    await addBlok(page, "context", `You are a support assistant. ${marker}`);
    await addBlok(page, "expected", "Refuse to answer questions about pricing.");
    await addBlok(page, "context", "{{answer}}");
    await declare(page, "answer");
    return promptId;
  }

  async function runIt(page: Page, promptId: string): Promise<void> {
    await page.goto(`/app/pr/${promptId}/runs`);
    await page.getByRole("button", { name: "Run inputs.csv" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });
  }

  test("grades a refusal check that nothing deterministic could grade", async ({ page }) => {
    const marker = `judged ${Date.now()}`;
    const promptId = await promptThatMustRefuse(page, marker);
    await uploadCsv(page, promptId, "inputs.csv", csvFor(marker));
    await runIt(page, promptId);

    const results = page.getByRole("region", { name: "Results by check" });
    const row = results.locator("li").filter({ hasText: "Refuse to answer questions about pricing." });

    // **The whole point.** Before this epic the same check was `Not checked` for every input.
    await expect(row).not.toContainText("Not checked");
    // One input refused and one answered, so the check is a failure with exactly one passing input.
    await expect(row).toContainText("1 of 2 passed");
    await expect(row.locator(".status-icon")).toHaveText("✕");
  });

  test("shows the judge's own words, attributed to the pinned judge", async ({ page }) => {
    const marker = `rationale ${Date.now()}`;
    const promptId = await promptThatMustRefuse(page, marker);
    await uploadCsv(page, promptId, "inputs.csv", csvFor(marker));
    await runIt(page, promptId);

    await page.getByRole("button", { name: "Show failure" }).click();
    const evidence = page.getByTestId("failure-detail").getByTestId("evidence");
    await expect(evidence).toBeVisible();
    // Attributed: the reader is told a model said it, and which model.
    await expect(evidence).toContainText("Judged by");
    await expect(evidence).toContainText("claude-haiku-4-5-20251001");
    await expect(evidence).toContainText("engages with what was asked");
    // Marked as testimony rather than as a measurement anybody could re-derive.
    await expect(evidence).toHaveAttribute("data-judged", "true");
  });

  /**
   * Decision 4: two questions, two numbers. A single figure containing both answers neither.
   */
  test("counts what judging cost apart from what the run cost", async ({ page }) => {
    const marker = `cost ${Date.now()}`;
    const promptId = await promptThatMustRefuse(page, marker);
    await uploadCsv(page, promptId, "inputs.csv", csvFor(marker));
    await runIt(page, promptId);

    const judge = page.getByTestId("judge-cost-sentence");
    await expect(judge).toBeVisible();
    await expect(judge).toContainText("Judging cost");
    await expect(judge).toContainText("apart from the run");

    // And it is a different sentence from the run's own, not a clause folded into it.
    await expect(page.getByTestId("cost-sentence")).not.toContainText("Judging cost");
  });

  /**
   * A judge call is a run, so a second identical judgement is answered by the cache and calls
   * nobody. Worth its own test rather than being the accident that broke the one above: it is the
   * property that keeps a judge affordable on a two-hundred-input set.
   */
  test("answers an identical judgement from the cache the second time", async ({ page }) => {
    const marker = `cached ${Date.now()}`;
    const promptId = await promptThatMustRefuse(page, marker);
    await uploadCsv(page, promptId, "inputs.csv", csvFor(marker));

    await runIt(page, promptId);
    await expect(page.getByTestId("judge-cost-sentence")).toContainText("apart from the run");

    await runIt(page, promptId);
    const again = page.getByTestId("judge-cost-sentence");
    await expect(again).toContainText("Judging cost nothing");
    await expect(again).toContainText("cache");
  });

  /**
   * The absence case, which matters as much: a prompt with nothing to judge says nothing about a
   * judge. "$0.00 on the judge" would invite a reader to work out why it is zero.
   */
  test("says nothing about a judge when there was nothing to judge", async ({ page }) => {
    const promptId = await newPrompt(page, "No judgement");
    await addBlok(page, "context", `You are a support assistant. nojudge ${Date.now()}`);
    await addBlok(page, "expected", 'Never mention "sorry".');
    await addBlok(page, "context", "{{answer}}");
    await declare(page, "answer");
    await uploadCsv(page, promptId, "inputs.csv", "answer\nAll good.\n");
    await runIt(page, promptId);

    await expect(page.getByTestId("cost-sentence")).toBeVisible();
    await expect(page.getByTestId("judge-cost-sentence")).toHaveCount(0);
  });
});
