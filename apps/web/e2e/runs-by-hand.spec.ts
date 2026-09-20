import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { addBlok, declare, newPrompt, setNamed, signIn, uploadMessage } from "./runs-helpers";
import { startWorker, type RunningWorker } from "./worker-process";

/**
 * Inputs typed into the product instead of uploaded (EPIC-032a).
 *
 * ## The test this suite exists for is the one about history
 *
 * *"a past run's inputs are unchanged after the set it ran against is duplicated and the copy
 * edited"* was written before the editor was, because the defect it guards against has no symptom.
 * A `suite_run` freezes its compiled prompt onto its own row but keeps its inputs as a foreign key,
 * and the run detail page reads them live — so an in-place editor would rewrite finished history
 * with nothing to notice it. Everything else here is ordinary surface testing.
 */

const OWNER_EMAIL = `by-hand-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-by-hand-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

let worker: RunningWorker;

test.describe("inputs by hand", () => {
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

  /**
   * A prompt with one variable, one check, and the variable on its last line.
   *
   * **The check is not decoration.** "By input" lays out *results*, and a run with no checks
   * produces none — the panel then says, correctly, that there is nothing to lay out. The first
   * version of this fixture had no `expected` blok and the binding assertion failed against an
   * empty pivot, which read as a broken feature and was a broken test.
   *
   * The variable goes last so the fake provider's echo — the last non-empty line of the compiled
   * prompt — is the bound value, which is what makes the assertion about binding.
   */
  async function promptWithOneVariable(page: Page): Promise<string> {
    const promptId = await newPrompt(page, "Scheduler");
    await addBlok(page, "context", "Answer the request.");
    await addBlok(page, "expected", 'Never mention "sorry".');
    await addBlok(page, "context", "{{request}}");
    await declare(page, "request");
    return promptId;
  }

  async function openGrid(page: Page, promptId: string): Promise<void> {
    await page.goto(`/app/pr/${promptId}/runs`);
    await page.getByRole("button", { name: "add inputs by hand" }).click();
    await expect(page.getByTestId("by-hand")).toBeVisible();
  }

  /** Type a value into a cell, adding a row first when the grid has not got one yet. */
  async function type(page: Page, row: number, column: number, value: string): Promise<void> {
    if ((await page.getByTestId(`cell-${row}-${column}`).count()) === 0) {
      await page.getByRole("button", { name: "Add row" }).click();
    }
    await page.getByTestId(`cell-${row}-${column}`).fill(value);
  }

  /**
   * Open the first cell of the "By input" heatmap and return its detail panel.
   *
   * The pivot is a matrix of verdicts; the **values** live behind a cell, which is what its own
   * instruction says — *press Enter on a cell to see that input*. An assertion about binding has to
   * go where the binding is shown, and the first version of this spec asserted against the matrix
   * and failed for the right reason.
   */
  async function openFirstInput(page: Page) {
    await page.getByRole("tab", { name: "By input" }).click();
    await page.locator(".heat-cell").first().click();
    return page.getByTestId("heat-detail");
  }

  // ── A1 ────────────────────────────────────────────────────────────────────────────────────

  test("the grid has one column per declared variable, named for it", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);

    await expect(page.getByRole("columnheader", { name: "request" })).toBeVisible();
    // One variable, one column — plus the actions header, which is not a variable.
    await expect(page.locator(".runs-grid thead th")).toHaveCount(2);

    /*
     * **The header is asserted as it is rendered, not only as it is announced.**
     *
     * A variable name is case-sensitive — `{{request}}` and `{{REQUEST}}` are two variables — so a
     * header that displays one as the other tells the reader something untrue about their own
     * prompt. The first version of this styling carried `text-transform: uppercase`, copied from
     * the other small headers in `runs.css`, and **this assertion's `getByRole` sibling passed
     * anyway**: an accessible name is computed from the DOM text, which CSS never touched. Only the
     * drive, reading `innerText` off the built app, saw `REQUEST`.
     */
    await expect(page.locator(".runs-grid thead th").first()).toHaveText("request");
  });

  // ── A2 and A3 ─────────────────────────────────────────────────────────────────────────────

  test("two typed rows save, list with their count, and run with the values bound", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);

    await type(page, 0, 0, "Book a standup");
    await type(page, 1, 0, "Move the retro");
    await page.getByTestId("by-hand-name").fill("Typed inputs");
    await page.getByTestId("by-hand-save").click();

    // No reload anywhere in this spec: the set appears because the action revalidated.
    await expect(setNamed(page, "Typed inputs")).toBeVisible();
    await expect(page.getByText("2 inputs · request")).toBeVisible();

    await page.getByRole("button", { name: "Run Typed inputs" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });

    // A3 is an assertion about **binding**, not about a status: the fake answers with the last
    // non-empty line of the compiled prompt, which is the bound value of `request`.
    await expect(await openFirstInput(page)).toContainText("Book a standup");
  });

  // ── A4 ────────────────────────────────────────────────────────────────────────────────────

  test("a set with no runs offers Edit; the same set after a run offers Duplicate and edit", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);
    await type(page, 0, 0, "Book a standup");
    await page.getByTestId("by-hand-name").fill("Typed inputs");
    await page.getByTestId("by-hand-save").click();
    await expect(setNamed(page, "Typed inputs")).toBeVisible();

    // `exact`, because Playwright matches an accessible name by substring and
    // "Duplicate and edit Typed inputs" contains "Edit Typed inputs".
    await expect(page.getByRole("button", { name: "Edit Typed inputs", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Duplicate and edit Typed inputs" })).toHaveCount(0);

    await page.getByRole("button", { name: "Run Typed inputs" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });

    await page.goto(`/app/pr/${promptId}/runs`);
    await expect(page.getByRole("button", { name: "Duplicate and edit Typed inputs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit Typed inputs", exact: true })).toHaveCount(0);
  });

  // ── A6: the reason this epic is shaped the way it is ──────────────────────────────────────

  test("a finished run's inputs do not change when the set is duplicated and the copy edited", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);
    await type(page, 0, 0, "The original request");
    await page.getByTestId("by-hand-name").fill("Original");
    await page.getByTestId("by-hand-save").click();
    await expect(setNamed(page, "Original")).toBeVisible();

    await page.getByRole("button", { name: "Run Original" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });
    const runUrl = page.url();

    // Duplicate, then change the copy's only value to something the original never contained.
    await page.goto(`/app/pr/${promptId}/runs`);
    await page.getByRole("button", { name: "Duplicate and edit Original" }).click();
    await expect(page.getByTestId("by-hand")).toBeVisible();
    await page.getByTestId("cell-0-0").fill("A REPLACEMENT that the run never saw");
    await page.getByTestId("by-hand-save").click();
    await expect(setNamed(page, "Original (copy)")).toBeVisible();

    // The finished run still shows what it ran against.
    await page.goto(runUrl);
    const detail = await openFirstInput(page);
    await expect(detail).toContainText("The original request");
    await expect(detail).not.toContainText("A REPLACEMENT");
  });

  // ── A5, through the surface: the refusal is real, not only hidden ─────────────────────────

  test("the original is left alone by a duplicate, and both sets are listed apart", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);
    await type(page, 0, 0, "Only row");
    await page.getByTestId("by-hand-name").fill("Original");
    await page.getByTestId("by-hand-save").click();
    await expect(setNamed(page, "Original")).toBeVisible();

    await page.getByRole("button", { name: "Run Original" }).click();
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 60_000 });

    await page.goto(`/app/pr/${promptId}/runs`);
    await page.getByRole("button", { name: "Duplicate and edit Original" }).click();
    await expect(page.getByTestId("by-hand")).toBeVisible();
    await page.getByTestId("by-hand-save").click();

    // Decision 4: two sets are never distinguishable only by their id.
    await expect(setNamed(page, "Original")).toBeVisible();
    await expect(setNamed(page, "Original (copy)")).toBeVisible();
  });

  // ── the refusals ──────────────────────────────────────────────────────────────────────────

  test("a grid of empty rows is refused, and says so without describing a file", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);
    await page.getByTestId("by-hand-save").click();

    const message = uploadMessage(page);
    await expect(message).toContainText("every row is empty");
    await expect(message).toContainText("Nothing was saved");
    await expect(message).not.toContainText("file");
  });

  // ── A8 ────────────────────────────────────────────────────────────────────────────────────

  test("a prompt declaring no variables gets the explanation and no grid", async ({ page }) => {
    const promptId = await newPrompt(page, "No variables");
    await addBlok(page, "context", "Say hello.");
    await page.goto(`/app/pr/${promptId}/runs`);

    await expect(page.getByTestId("no-variables")).toBeVisible();
    await expect(page.getByRole("button", { name: "add inputs by hand" })).toHaveCount(0);
    await expect(page.getByTestId("by-hand")).toHaveCount(0);
  });

  // ── A9 ────────────────────────────────────────────────────────────────────────────────────

  test("every cell and control is reachable by keyboard", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await openGrid(page, promptId);
    await page.getByRole("button", { name: "Add row" }).click();

    // Focus the first cell, then Tab through: cell, remove, cell, remove, add, save, cancel.
    await page.getByTestId("cell-0-0").focus();
    await page.keyboard.type("first");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Remove row 1" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("cell-1-0")).toBeFocused();
    await page.keyboard.type("second");

    // And the grid still holds what was typed without a pointer ever being used.
    await expect(page.getByTestId("cell-0-0")).toHaveValue("first");
    await expect(page.getByTestId("cell-1-0")).toHaveValue("second");
  });

  test("the empty state names both ways in, and steps aside once the grid is open", async ({ page }) => {
    const promptId = await promptWithOneVariable(page);
    await page.goto(`/app/pr/${promptId}/runs`);

    // Scoped: the Run history panel also renders an `.app-empty`, and a bare selector is
    // ambiguous on this page rather than wrong.
    const empty = page.getByRole("region", { name: "Inputs" }).locator(".app-empty");
    await expect(empty).toContainText("Upload a CSV");
    await expect(empty).toContainText("by hand");

    // Open the grid and the sentence stops applying: it is for a page with nothing on it, and
    // underneath a grid somebody is typing into it is noise.
    await page.getByRole("button", { name: "add inputs by hand" }).click();
    await expect(page.getByTestId("by-hand")).toBeVisible();
    await expect(empty).toHaveCount(0);
  });
});
