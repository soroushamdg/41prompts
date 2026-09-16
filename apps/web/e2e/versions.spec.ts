import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser, versionsFor, versionOfRun } from "./db";
import { addBlok, declare, newPrompt, signIn, uploadCsv } from "./runs-helpers";

/**
 * Versions, through the product (EPIC-040).
 *
 * **This is where core and the database meet.** `packages/core` proves the diff maths and
 * `packages/db` proves the three minting rules, each against its own inputs. Neither can prove that
 * the canvas actually calls them, that the snapshot the web app builds is the one a run would send,
 * or that a person typing into a textarea ends up with one version rather than twelve. That is
 * this file.
 *
 * **No reload anywhere, and no `waitForTimeout`.** `PROCESS.md`'s rule about helpers that normalise
 * state applies with unusual force here: a reload between a save and a version read would turn "the
 * action recorded a version" into "a server render happened", which is the claim this epic must not
 * accidentally substitute. `addBlok` waits on the blok's own saved state, which is a real condition.
 *
 * **No worker is started.** Every assertion here is about what `startRunAction` does *before* it
 * enqueues anything — the pin is the last thing that happens before the row is created. A run that
 * then refuses for want of a worker has already told this file everything it asks.
 */

const OWNER_EMAIL = `versions-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-versions-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

/** A prompt that can actually be run: one variable, declared, so a CSV has a column to match. */
async function runnablePrompt(page: Page, name: string, context: string): Promise<string> {
  const promptId = await newPrompt(page, name);
  await addBlok(page, "context", context);
  await addBlok(page, "context", "{{answer}}");
  await declare(page, "answer");
  await uploadCsv(page, promptId, "inputs.csv", "answer\nhello\n");
  return promptId;
}

/** Trigger the run and return its id, read from the URL the trigger lands on. */
async function run(page: Page, promptId: string): Promise<string> {
  await page.goto(`/app/pr/${promptId}/runs`);
  await page.getByRole("button", { name: "Run inputs.csv" }).click();
  await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
  return page.url().split("/runs/")[1]!;
}

test.describe("versions", () => {
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

  test("a new prompt's edits collapse into one open draft, not one version per save", async ({ page }) => {
    const promptId = await newPrompt(page, "Versioned");

    await addBlok(page, "context", "You route inbound support email.");
    await addBlok(page, "constraint", "Reply in at most 80 words.");
    await addBlok(page, "expected", "Respond with valid JSON.");

    // Three bloks, each an add and a save — six writes at least, and one row. This is the whole
    // reason the rules are what they are: one version per episode of editing, not one per keystroke
    // pause, or EPIC-041 inherits a history nobody can read.
    const versions = await versionsFor(promptId);
    expect(versions).toHaveLength(1);
    expect(versions[0]?.n).toBe(1);
    expect(versions[0]?.pinnedAt).toBeNull();
    expect(versions[0]?.compiledText).toContain("Reply in at most 80 words.");
  });

  test("triggering a run pins the draft, and the next edit opens the next one", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Pinned", "Answer the question.");
    await run(page, promptId);

    const pinned = (await versionsFor(promptId))[0]!;
    expect(pinned.n).toBe(1);
    expect(pinned.pinnedAt).not.toBeNull();

    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");

    const after = await versionsFor(promptId);
    expect(after.map((version) => version.n)).toEqual([2, 1]);
    // v1 is frozen at what it was when the run pointed at it — the property the whole epic is for.
    expect(after.find((version) => version.n === 1)?.compiledText).not.toContain("Never promise a refund.");
    expect(after.find((version) => version.n === 2)?.compiledText).toContain("Never promise a refund.");
  });

  test("the run points at the version it ran, so what it scored stays answerable", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Attributed", "Summarise the message.");
    const runId = await run(page, promptId);

    const version = (await versionsFor(promptId))[0]!;
    expect(await versionOfRun(runId)).toBe(version.id);
  });

  test("running twice without editing reuses the same version rather than minting a second", async ({ page }) => {
    const promptId = await runnablePrompt(page, "Rerun", "Classify the message.");
    const first = await run(page, promptId);
    const second = await run(page, promptId);

    expect(second).not.toBe(first);
    const versions = await versionsFor(promptId);
    expect(versions).toHaveLength(1);
    // Two runs, one version, and both point at it. Running the same prompt twice is an ordinary
    // thing to do and it is the same prompt both times.
    expect(await versionOfRun(first)).toBe(versions[0]!.id);
    expect(await versionOfRun(second)).toBe(versions[0]!.id);
  });

  test("the snapshot is what a run would send, hand edits included", async ({ page }) => {
    const promptId = await newPrompt(page, "Edited by hand");
    await addBlok(page, "constraint", "Reply in at most 80 words.");

    // Take the span by hand in the compiled pane, exactly as `compiled-pane.spec.ts` does.
    await page.locator(".compiled-notes > div").nth(0).getByRole("button", { name: "Edit by hand" }).click();
    await page.getByLabel("Edit this span by hand").fill("Keep it under 40 words.");
    await page.getByRole("button", { name: "Save this span" }).click();
    await expect(page.locator(".compiled-span").nth(0)).toHaveAttribute("data-presentation", "edited");

    // The version's compiled text must be the edited span, not what the compiler would render on
    // its own — otherwise a version and the run pinned to it describe two different prompts, and
    // the version's hash could never be checked against the run's.
    const versions = await versionsFor(promptId);
    expect(versions[0]?.compiledText).toContain("Keep it under 40 words.");
    expect(versions[0]?.compiledText).not.toContain("Reply in at most 80 words.");
  });
});
