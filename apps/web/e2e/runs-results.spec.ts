import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { blokTimestampsFor, deleteTestUser } from "./db";
import { addBlok, declare, newPrompt, signIn, uploadCsv } from "./runs-helpers";
import { startWorker, type RunningWorker } from "./worker-process";

/**
 * The results surface, against a worker running the deterministic fake.
 *
 * ## Why the fake makes this a real test rather than a fixture
 *
 * It answers with the **last non-empty line of the prompt it was given**, and the last blok of the
 * prompt below is `{{answer}}`. So the model's answer *is* the value the CSV supplied, which means
 * these assertions fail if the binding breaks — an ordinary stub returning a canned string would
 * pass whether the row reached the model or not.
 *
 * The three expected bloks are chosen so that one check fails on one input and passes on the other,
 * one passes everywhere, and one cannot be graded at all. A fixture where everything agrees proves
 * much less than one where they do not.
 */

const OWNER_EMAIL = `runs-results-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-results-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

/**
 * **The second value is quoted, and that is the point of it.**
 *
 * `I am sorry, no.` carries a comma, so unquoted it is two fields against a one-column header and
 * the upload is refused — correctly, by RFC 4180 — with "Line 3 has 2 values where the header names
 * 1.". The first draft of this fixture was written that way and every test that ran a suite failed
 * looking for a Run button that the refusal meant was never rendered. The parser was right and the
 * fixture was wrong, which is worth keeping here as a comment rather than quietly fixing: a person
 * pasting a sentence into a spreadsheet column will hit exactly this.
 */
const CSV = 'answer\nAll good.\n"I am sorry, no."\n';

let worker: RunningWorker;

/**
 * A prompt with three checks, one of which nothing can grade, ending in the bound answer.
 *
 * `marker`, when given, is one extra context blok whose text nothing else in this file shares.
 * `cacheKey` is the prompt hash, the input hash and the model — **not** the prompt id — so two
 * prompts built identically here compile to the same text and the second one's run is answered
 * from the first one's cache. That is EPIC-031 decision 5 working; the one test that needs a run
 * which actually calls something has to make its content unique to get one.
 *
 * It goes **before** the `{{answer}}` blok deliberately: the fake echoes the last non-empty line of
 * what it was given, and that line has to stay the bound value or the binding is no longer what
 * these assertions are reading.
 */
async function promptWithChecks(page: Page, marker?: string): Promise<string> {
  const promptId = await newPrompt(page, "Classifier");
  await addBlok(page, "context", "You are a support assistant.");
  await addBlok(page, "expected", 'Never mention "sorry".');
  await addBlok(page, "expected", "Reply in at most 30 words.");
  // Matches the "must not contain" shape and quotes nothing, so no parameter can be derived from
  // it — `not_graded` with `params_not_derivable`, which is one of the four this page tells apart.
  await addBlok(page, "expected", "Never mention refunds.");
  if (marker !== undefined) await addBlok(page, "context", marker);
  await addBlok(page, "context", "{{answer}}");
  await declare(page, "answer");
  return promptId;
}

async function runToCompletion(page: Page, promptId: string): Promise<void> {
  await page.goto(`/app/pr/${promptId}/runs`);
  await page.getByRole("button", { name: "Run inputs.csv" }).click();
  await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
  await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });
}

test.describe("results by check", () => {
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

  test("lists results by check, each with its blok, a meter, and an icon beside the colour", async ({ page }) => {
    const promptId = await promptWithChecks(page);
    await uploadCsv(page, promptId, "inputs.csv", CSV);
    await runToCompletion(page, promptId);

    const results = page.getByRole("region", { name: "Results by check" });
    await expect(results).toBeVisible();

    const failing = results.locator("li[data-status='fail']");
    await expect(failing).toHaveCount(1);
    await expect(failing).toContainText("must not contain");
    await expect(failing).toContainText('Never mention "sorry".');
    await expect(failing).toContainText("1 of 2 passed");
    // Rule 10: the icon, not only the colour. `✕` is the fail glyph.
    await expect(failing.locator(".status-icon")).toHaveText("✕");
    // The meter carries the number in its accessible name, so it is readable without seeing it.
    await expect(failing.getByRole("meter")).toHaveAttribute("aria-valuetext", "1 of 2 inputs passed");

    const passing = results.locator("li[data-status='pass']");
    await expect(passing).toHaveCount(1);
    await expect(passing.locator(".status-icon")).toHaveText("✓");

    // A check nothing could grade is neither a pass nor a failure, and carries no colour.
    const notChecked = results.locator("li[data-status='not-checked']");
    await expect(notChecked).toHaveCount(1);
    await expect(notChecked).toContainText("Not checked");
    await expect(notChecked.locator(".status-icon")).toHaveCount(0);
  });

  test("a failing check opens a detail with the failing region marked, and exactly one blok", async ({ page }) => {
    const promptId = await promptWithChecks(page);
    await uploadCsv(page, promptId, "inputs.csv", CSV);
    await runToCompletion(page, promptId);

    await page.getByRole("button", { name: "Show failure" }).click();
    const detail = page.getByTestId("failure-detail");
    await expect(detail).toBeVisible();

    // The output is the bound value, which is how this proves the row reached the model.
    await expect(detail.getByTestId("model-output")).toContainText("I am sorry, no.");
    // The failing region, from `Evidence`'s code-point offsets.
    await expect(detail.getByTestId("failing-region")).toHaveText("sorry");
    await expect(detail.getByTestId("evidence")).toContainText("Found “sorry”");

    // Exactly one owning blok, and its card. Attribution is read, never computed.
    await expect(detail.locator(".blok-card")).toHaveCount(1);
    await expect(detail.locator(".blok-card")).toContainText('Never mention "sorry".');
  });

  test("create constraint from this failure: preview first, cancel adds nothing, confirm adds one", async ({
    page,
  }) => {
    const promptId = await promptWithChecks(page);
    await uploadCsv(page, promptId, "inputs.csv", CSV);
    await runToCompletion(page, promptId);
    await page.getByRole("button", { name: "Show failure" }).click();

    const before = await blokTimestampsFor(promptId);

    // The preview comes first, always, and it shows the text that would be added.
    await page.getByRole("button", { name: "Create constraint from this failure" }).click();
    const preview = page.getByTestId("constraint-preview");
    await expect(preview).toBeVisible();
    await expect(preview.getByLabel("Constraint text")).toHaveValue('Never mention "sorry".');

    // Cancelling adds nothing at all.
    await preview.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("constraint-preview")).toHaveCount(0);
    expect(await blokTimestampsFor(promptId)).toHaveLength(before.length);

    await page.getByRole("button", { name: "Create constraint from this failure" }).click();
    await page.getByTestId("constraint-preview").getByRole("button", { name: "Add constraint blok" }).click();
    await expect(page.getByTestId("constraint-preview")).toHaveCount(0);

    // **Asserted at the database**, the way EPIC-021a decision 5's test is: exactly one new blok,
    // and no existing blok's `updatedAt` moved.
    const after = await blokTimestampsFor(promptId);
    expect(after).toHaveLength(before.length + 1);
    for (const row of before) {
      const same = after.find((candidate) => candidate.id === row.id)!;
      expect(same.updatedAt.getTime()).toBe(row.updatedAt.getTime());
    }

    // And it is on the canvas, as a constraint.
    await page.goto(`/app/pr/${promptId}`);
    await expect(page.locator(".canvas-list > li").last().getByLabel("Blok text")).toHaveValue(
      'Never mention "sorry".'
    );
  });

  test("says how many could not be checked and why, in its own sentence", async ({ page }) => {
    const promptId = await promptWithChecks(page);
    await uploadCsv(page, promptId, "inputs.csv", CSV);
    await runToCompletion(page, promptId);

    const notChecked = page.getByTestId("not-checked");
    await expect(notChecked).toContainText("2 of 6 could not be checked");
    await expect(notChecked).toContainText("the rule does not say what to measure");
  });

  /**
   * **The named test for the inherited requirement**, on the surface where a person reads it.
   *
   * A prompt whose every check is `not_graded` must not render the same words as one whose checks
   * all passed. EPIC-030 made that structurally hard to fudge by refusing to ship a `passed` field;
   * this is the last mile.
   */
  test("a run whose checks are all un-gradable does not read like one that passed", async ({ page }) => {
    const ungradable = await newPrompt(page, "Nothing gradable");
    await addBlok(page, "expected", "Never mention refunds.");
    await addBlok(page, "context", "{{answer}}");
    await declare(page, "answer");
    await uploadCsv(page, ungradable, "inputs.csv", "answer\nAll good.\n");
    await runToCompletion(page, ungradable);

    const headline = page.locator(".runs-headline");
    await expect(headline).toHaveText("Nothing here was verified.");
    await expect(page.getByTestId("not-checked")).toContainText("1 of 1 could not be checked");

    const passing = await newPrompt(page, "Everything passes");
    await addBlok(page, "expected", "Reply in at most 30 words.");
    await addBlok(page, "context", "{{answer}}");
    await declare(page, "answer");
    await uploadCsv(page, passing, "inputs.csv", "answer\nAll good.\n");
    await runToCompletion(page, passing);

    await expect(page.locator(".runs-headline")).toHaveText("Every check ran, and every one passed.");
    await expect(page.getByTestId("not-checked")).toHaveCount(0);
  });

  /**
   * The only test here that needs a first run which actually calls something, which is why it is
   * the only one that passes a marker — see `promptWithChecks`. Without it the "first" run is
   * answered from an earlier test's cache and spends nothing, and the charged-run sentence can
   * never appear.
   */
  test("the cost says what it counts, and a re-run is zero calls and zero spend", async ({ page }) => {
    const promptId = await promptWithChecks(page, `Run ${Date.now()} is not any earlier run.`);
    await uploadCsv(page, promptId, "inputs.csv", CSV);

    await runToCompletion(page, promptId);
    const first = page.getByTestId("cost-sentence");
    await expect(first).toContainText("not the cost of everything on this page");
    await expect(first).toContainText("2 calls");

    // The same prompt and the same inputs: every answer is already in the cache.
    await runToCompletion(page, promptId);
    const again = page.getByTestId("cost-sentence");
    await expect(again).toContainText("spent nothing");
    await expect(again).toContainText("cache");
    await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
  });

  /**
   * ## This test used to race the queue, and lost once (EPIC-043, 2026-09-16)
   *
   * It said "in flight at the first render — the queue has not picked it up yet" and asserted
   * `progress` was visible. **Nothing made that true.** `inFlight` is `queued || running`, so
   * `progress` disappears the moment a run reaches a terminal state — and with the deterministic
   * fake there is no network call, so the worker can drain both inputs inside the window between
   * the click and the server render. When it does, `progress` is not "not yet", it is already gone,
   * and the 5s retry can only wait for something that will never appear.
   *
   * It failed exactly that way in `gates.mjs ci` on this commit, and then passed three runs in
   * isolation, the whole file alone, and a full 223-test local suite. That is the signature of a
   * race, not of a broken assertion — and `docs/PROCESS.md` is explicit that "it passed on the
   * retry" is not a finding. So the race is removed rather than re-rolled.
   *
   * **In flight is now a state this test creates.** With no worker, the run stays `queued` for as
   * long as we like, so the first assertion is about what the page renders for an unfinished run
   * rather than about who won. Starting the worker afterwards is what the second half then watches,
   * which makes this a stronger test of the actual criterion — the page advances **by itself**,
   * with no reload, while somebody is looking at it.
   *
   * Killing the worker is safe and is the mechanism `worker-process.ts` already documents: pg-boss
   * survives an ungraceful exit and the next worker picks the jobs up, so nothing is orphaned — the
   * queue backlog EPIC-041 had to add a global-setup sweep for came from jobs nobody ever started a
   * worker for, which is the opposite case.
   */
  test("progress advances without a reload while a run is in flight", async ({ page }) => {
    const promptId = await promptWithChecks(page);
    await uploadCsv(page, promptId, "inputs.csv", CSV);

    // Nothing can finish this run while it is triggered.
    await worker.stop();

    await page.goto(`/app/pr/${promptId}/runs`);
    await page.getByRole("button", { name: "Run inputs.csv" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);

    // Visible because the run is genuinely unfinished, not because we got here first.
    await expect(page.getByTestId("progress")).toBeVisible();
    await expect(page.getByTestId("progress")).toContainText("0 of 2");

    // **No reload between here and the next assertion.** `router.refresh()` re-renders the page
    // that is already open; a reload would satisfy this line while proving nothing about it. The
    // page has been open and polling the whole time the worker was starting.
    worker = await startWorker({ FAKE_PROVIDER: "1" });
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });
    await expect(page.getByTestId("progress")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Results by check" })).toBeVisible();
  });
});
