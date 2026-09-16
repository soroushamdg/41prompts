import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser, everyBlokFor, runsFor, versionsFor } from "./db";
import { addBlok, declare, newPrompt, signIn, uploadCsv } from "./runs-helpers";

/**
 * The Versions page (EPIC-041): the history, the diff, restore, and A/B.
 *
 * **This file is about the surface**, where `versions.spec.ts` is about the minting rules underneath
 * it. The two kinds of assertion are kept apart deliberately: "the save wrote one row" is a database
 * fact and belongs there, and "a person can see what changed and put it back" is this page's job.
 *
 * Where a claim is *only* checkable in the database — two runs sharing one `comparison`, a
 * soft-deleted row still existing — the assertion reads the table, because the page shows the same
 * thing either way and a surface assertion would not be about the criterion.
 *
 * **No reload anywhere, and no `waitForTimeout`.** Every write revalidates on the server and the
 * page asks the router to re-render; a reload here would turn "the action worked" into "a server
 * render happened", which is the substitution `PROCESS.md` has a rule about.
 *
 * **No worker is started.** Everything asserted about A/B happens at trigger time — two rows, two
 * versions, one comparison — and a run that then sits queued has already answered every question in
 * this file.
 */

const OWNER_EMAIL = `versions-page-${Date.now()}@example.test`;
const STRANGER_EMAIL = `versions-stranger-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-versions-page-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

/** A prompt that can be run: one variable, declared, and a CSV with a column for it. */
async function runnablePrompt(page: Page, name: string): Promise<string> {
  const promptId = await newPrompt(page, name);
  await addBlok(page, "context", "You route inbound support email about {{topic}}.");
  await declare(page, "topic");
  await uploadCsv(page, promptId, "inputs.csv", "topic\nrefunds\n");
  return promptId;
}

/** Trigger a run, which pins the open draft so the next edit opens the next version. */
async function run(page: Page, promptId: string): Promise<string> {
  await page.goto(`/app/pr/${promptId}/runs`);
  await page.getByRole("button", { name: "Run inputs.csv" }).click();
  await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
  return page.url().split("/runs/")[1]!;
}

const versionsPage = (page: Page, promptId: string) => page.goto(`/app/pr/${promptId}/versions`);
const items = (page: Page) => page.locator(".versions-list > li");
const diffLines = (page: Page) => page.locator(".versions-diff > li");

test.describe("the Versions page", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(await context.newPage(), OWNER_EMAIL);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    await deleteTestUser(OWNER_EMAIL);
    await deleteTestUser(STRANGER_EMAIL);
  });

  test.use({ storageState: STATE_FILE });

  test("is reachable from the prompt without anybody knowing the URL", async ({ page }) => {
    // A page nothing links to is a page nobody finds — the whole content of the `/app` dead end.
    const promptId = await newPrompt(page, "Linked");
    await addBlok(page, "context", "Answer the question.");

    await page.getByRole("link", { name: "Versions" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pr/${promptId}/versions$`));
    await expect(page.getByRole("heading", { name: "Versions", level: 1 })).toBeVisible();
  });

  test("lists the history as Draft vN, newest first", async ({ page }) => {
    const promptId = await runnablePrompt(page, "History");
    await run(page, promptId);
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");

    await versionsPage(page, promptId);
    await expect(items(page)).toHaveCount(2);
    await expect(items(page).nth(0).locator(".versions-item-name")).toHaveText("Draft v2");
    await expect(items(page).nth(1).locator(".versions-item-name")).toHaveText("Draft v1");
  });

  test("says a version has had no run rather than showing it as zero", async ({ page }) => {
    // EPIC-030 made `not_graded` a third outcome that is never folded into a fail, and a version
    // nothing has run is a fourth thing again. "0%" would say it failed everything.
    const promptId = await newPrompt(page, "Unrun");
    await addBlok(page, "context", "Answer the question.");

    await versionsPage(page, promptId);
    await expect(items(page).nth(0).locator(".versions-item-rate")).toHaveText("No run yet.");
  });

  test("a prompt with one version says so instead of rendering an empty diff", async ({ page }) => {
    const promptId = await newPrompt(page, "Only one");
    await addBlok(page, "context", "Answer the question.");

    await versionsPage(page, promptId);
    await expect(items(page)).toHaveCount(1);
    await expect(page.getByTestId("no-diff")).toContainText("only one version");
  });

  test("the diff says what an edit changed, and gives the compiled byte delta", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Diffed");
    await run(page, promptId);
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");

    await versionsPage(page, promptId);
    await expect(page.getByRole("heading", { name: "Draft v1 → Draft v2" })).toBeVisible();
    await expect(diffLines(page)).toHaveCount(1);
    await expect(diffLines(page).nth(0)).toHaveAttribute("data-verb", "added");
    await expect(diffLines(page).nth(0)).toContainText("Never promise a refund.");
    await expect(page.locator(".versions-bytes")).toContainText("bytes");
  });

  test("a moved blok reads as moved, never as removed plus added", async ({ page }) => {
    // `docs/roadmap.md`'s named test, asserted where a person would read it. `packages/core` proves
    // the maths and `view.test.ts` proves the wording; this proves the product does it end to end,
    // with a blok dragged by the same control a person uses.
    const promptId = await runnablePrompt(page, "Moved");
    // `runnablePrompt` ends on the Runs page, where the CSV went. The canvas is where bloks are.
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Reply in at most 80 words.");
    await run(page, promptId);

    await page.goto(`/app/pr/${promptId}`);
    await page
      .locator(".canvas-list > li")
      .nth(1)
      .getByRole("button", { name: "Move up" })
      .click();
    await expect(page.locator(".canvas-list > li").nth(0)).toContainText("Reply in at most 80 words.");

    // **The card moving is not the move being saved.** `canvas.tsx` reorders optimistically and then
    // asks the server for the neighbouring ranks, so the DOM is ahead of the database by a round
    // trip — navigating on the strength of the DOM abandons the write, which is what made this test
    // fail with an empty diff the first time. The real condition is the version the move records.
    await expect.poll(async () => (await versionsFor(promptId)).length).toBe(2);

    await versionsPage(page, promptId);
    const verbs = await diffLines(page).evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-verb")),
    );
    expect(verbs).toContain("moved");
    expect(verbs).not.toContain("removed");
    expect(verbs).not.toContain("added");
  });

  test("restore puts the canvas back, and the history only ever grows", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Restored");
    await run(page, promptId);

    // Everything after this point is what restore has to undo.
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");
    const before = await versionsFor(promptId);
    expect(before.map((version) => version.n)).toEqual([2, 1]);

    await versionsPage(page, promptId);
    await page.getByRole("button", { name: "Restore Draft v1" }).click();

    // **Wait on the restore having happened, not on a duration.** The click starts a server action
    // and the page re-renders when it returns; navigating away before then would abandon it, and the
    // next assertion would be about a canvas the action never reached. The real condition is the
    // version the restore mints — three rows where there were two.
    await expect(items(page)).toHaveCount(3);

    // The canvas is what it was: the constraint is gone from it.
    await page.goto(`/app/pr/${promptId}`);
    await expect(page.locator(".canvas-list > li")).toHaveCount(1);
    await expect(page.locator(".canvas-list")).not.toContainText("Never promise a refund.");

    // **Restore never deletes** — the roadmap's Review line, from three directions.
    const after = await versionsFor(promptId);
    expect(after.length).toBeGreaterThan(before.length);
    // The work that was open when restore was pressed is still in the history, pinned.
    const kept = after.find((version) => version.compiledText.includes("Never promise a refund."));
    expect(kept).toBeDefined();
    expect(kept?.pinnedAt).not.toBeNull();
    // And the blok row itself is soft-deleted, not gone, so Undo is still clearing a column.
    const rows = await everyBlokFor(promptId);
    const removed = rows.find((row) => row.text === "Never promise a refund.");
    expect(removed).toBeDefined();
    expect(removed?.deletedAt).not.toBeNull();
  });

  test("a note can be written on a version and shows in the history", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Noted");
    await run(page, promptId);

    await versionsPage(page, promptId);
    await page.getByLabel("Note on Draft v1").fill("before the refund change");
    await page.getByRole("button", { name: "Save note" }).click();

    // The note appearing in the history *is* the condition — no reload, no wait for a duration.
    await expect(items(page).nth(0).locator(".versions-item-note")).toHaveText("before the refund change");
  });

  test("A/B creates two linked runs, one per version, over one input set", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Compared");
    await run(page, promptId);
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");

    await versionsPage(page, promptId);
    await page.getByRole("button", { name: "A/B Draft v1 vs Draft v2" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pr/${promptId}/runs$`));

    const runs = await runsFor(promptId);
    const paired = runs.filter((row) => row.comparison !== null);
    expect(paired).toHaveLength(2);
    // One comparison, two versions, two different frozen prompts — which is the whole claim.
    expect(new Set(paired.map((row) => row.comparison)).size).toBe(1);
    expect(new Set(paired.map((row) => row.version)).size).toBe(2);
    expect(paired.some((row) => row.promptText.includes("Never promise a refund."))).toBe(true);
    expect(paired.some((row) => !row.promptText.includes("Never promise a refund."))).toBe(true);

    // And each run says which version it ran, on the page a person lands on.
    await expect(page.locator(".runs-history-version").first()).toContainText("Ran Draft v");
    await expect(page.locator(".runs-history-version").first()).toContainText("one half of an A/B");
  });

  test("another account's prompt is a 404, never a 403", async ({ browser, page }) => {
    // A 403 would confirm the id is real, which is a disclosure on its own.
    const promptId = await newPrompt(page, "Private");
    await addBlok(page, "context", "Answer the question.");

    const context = await browser.newContext();
    const stranger = await context.newPage();
    await signIn(stranger, STRANGER_EMAIL);
    const response = await stranger.goto(`/app/pr/${promptId}/versions`);
    expect(response?.status()).toBe(404);
    await context.close();
  });
});
