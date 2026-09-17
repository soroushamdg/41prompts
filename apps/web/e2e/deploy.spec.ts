import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { expectNoHorizontalOverflow } from "./overflow";
import { addBlok, newPrompt, signIn } from "./runs-helpers";

/**
 * The Deploy page (EPIC-055 C1–C5, C14, C17).
 *
 * EPIC-051's `publish.spec.ts` drove these endpoints with `fetch` from inside the page, because
 * there was no page. This drives the page.
 *
 * ## The gate is blocked here by the contract row, not by a failing run
 *
 * A failing **checks** row needs a finished run with graded results, which needs a provider to have
 * answered — and there is no provider key in an e2e run. The **contract** row blocks without any of
 * that: publish a version, then add a required variable, and the next version breaks the promise the
 * Live one made to anything already resolving it. That is a real block by a real blocking row, and
 * `lib/deploy/publish.test.ts` proves the checks row against seeded outcomes where a run's results
 * can be written without calling anybody.
 *
 * ## Nothing here reloads to make an assertion pass
 *
 * The three actions POST and then `router.refresh()`, so every assertion after one waits on a real
 * condition — a row appearing, a button's state — never on a duration. `PROCESS.md`'s rule about
 * helpers that normalise state.
 */

const OWNER_EMAIL = `deploy-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-deploy-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

/** A prompt with two bloks and no checks, so its gate is passable. */
async function publishable(page: Page, name: string): Promise<string> {
  const promptId = await newPrompt(page, name);
  await addBlok(page, "context", "You triage inbound support email for Northwind.");
  await addBlok(page, "constraint", "Reply in at most 80 words.");
  return promptId;
}

const gateRow = (page: Page, title: string) => page.locator(".deploy-row").filter({ hasText: title });

test.describe("Deploy", () => {
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

  // ── C1, C2 ─────────────────────────────────────────────────────────────────────────────────────

  test("says nothing is Live, names the Draft, and shows every gate row", async ({ page }) => {
    const promptId = await publishable(page, "Deployable");
    await page.goto(`/app/pr/${promptId}/deploy`);

    await expect(page.getByRole("heading", { name: "Deploy" })).toBeVisible();

    // Nothing Live: said in words, not an empty card.
    await expect(page.getByText("Nothing yet")).toBeVisible();
    await expect(page.getByText(/no application can resolve it/)).toBeVisible();

    // ADR-003's one vocabulary. `Draft vN`, never "v1 · unsaved" and never "current".
    await expect(page.locator(".deploy-env-draft .deploy-env-version")).toHaveText(/^Draft v\d+$/);
    await expect(page.getByText("unsaved")).toHaveCount(0);
    await expect(page.getByText("current", { exact: true })).toHaveCount(0);

    // The build hash appears once, under a label — "no bare shas in copy" (C8/ruling 8).
    await expect(page.locator(".deploy-env-buildlabel").first()).toHaveText("Build");

    // All four rows, each with a word beside its glyph — rule 10's second sentence.
    await expect(page.locator(".deploy-row")).toHaveCount(4);
    for (const title of [
      "Checks on this model",
      "Inputs compatible with shipped apps",
      "Cost per call",
      "Bloks changed since Live",
    ]) {
      await expect(gateRow(page, title)).toBeVisible();
    }
    for (const word of ["Passed", "For information"]) {
      await expect(page.locator(".deploy-row-verdict").filter({ hasText: word }).first()).toBeVisible();
    }
  });

  test("a verdict is never carried by colour alone", async ({ page }) => {
    const promptId = await publishable(page, "Coloured");
    await page.goto(`/app/pr/${promptId}/deploy`);

    // Every row has a visible verdict word. Strip the colours and the page still says what happened.
    const words = await page.locator(".deploy-row-verdict").allTextContents();
    expect(words).toHaveLength(4);
    for (const word of words) expect(word.trim().length).toBeGreaterThan(0);

    // And the glyph is there too, so it is icon + text rather than text alone.
    await expect(page.locator(".deploy-row-icon")).toHaveCount(4);
  });

  // ── C17: amber is drift's, and nothing else's ──────────────────────────────────────────────────

  test("no gate row is amber when nothing has drifted, and the probe can see amber", async ({ page }) => {
    const promptId = await publishable(page, "Inky");
    await page.goto(`/app/pr/${promptId}/deploy`);

    // With nothing Live there is no cost to compare, so the cost row is `info` — ink, not amber.
    const amber = await page.evaluate(() => {
      const warn = getComputedStyle(document.documentElement).getPropertyValue("--color-warn").trim();
      const rows = [...document.querySelectorAll(".deploy-row-verdict")];
      return {
        warn,
        colours: rows.map((row) => getComputedStyle(row).color),
      };
    });

    // The control: the probe must be able to tell amber from ink, or "none are amber" means nothing.
    expect(amber.warn.length).toBeGreaterThan(0);
    const asRgb = await page.evaluate((hex) => {
      const probe = document.createElement("span");
      probe.style.color = hex;
      document.body.append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    }, amber.warn);
    expect(asRgb).toMatch(/^rgb/);

    for (const colour of amber.colours) expect(colour).not.toBe(asRgb);
  });

  // ── C3, C4: a blocked publish, and going past it with a reason ─────────────────────────────────

  test("a broken input contract disables Publish, says why, and Publish anyway records the reason", async ({
    page,
  }) => {
    const promptId = await publishable(page, "Contractual");

    // 1. Publish once, so there is something in the field to break.
    await page.goto(`/app/pr/${promptId}/deploy`);
    await page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ }).click();
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText(/^Live v\d+$/);

    // 2. Add a blok using a variable nothing declared a default for. The next version now requires
    //    an input the shipped one did not, which is `added_required` — a blocking break.
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "context", "Write to {{customer_name}} by name.");
    await page.getByRole("tab", { name: "Variables" }).click();
    await page.getByRole("button", { name: "Declare customer_name" }).click();
    await expect(
      page.getByRole("region", { name: "Declared variables" }).getByText("customer_name", { exact: true }),
    ).toBeVisible();

    // 3. The gate stops it. C3: disabled, and it says what is stopping it rather than being grey.
    await page.goto(`/app/pr/${promptId}/deploy`);
    await expect(page.locator(".deploy-gatestate-stopped")).toContainText("Stopped");
    const stopped = page.getByRole("button", { name: /^Stopped/ });
    await expect(stopped).toBeDisabled();
    await expect(stopped).toContainText(/inputs compatible|checks on this model/i);
    await expect(gateRow(page, "Inputs compatible with shipped apps")).toContainText(
      "This would stop working for apps already in the field.",
    );

    // 4. A reason under the minimum is refused by the page before anything is sent.
    await page.getByRole("button", { name: "Publish anyway" }).click();
    await page.getByLabel(/Say why this is going Live/).fill("too short");
    await expect(page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ })).toBeDisabled();
    await expect(page.getByText(/At least 10 characters/)).toBeVisible();

    // 5. C4: a real reason publishes, and the history says it went past the gate.
    await page.getByLabel(/Say why this is going Live/).fill("hotfix, the refund wording is wrong in production");
    await page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ }).click();

    const anyway = page.locator(".deploy-history-anyway");
    await expect(anyway).toBeVisible();
    await expect(anyway).toContainText("Published anyway");
    await expect(anyway).toContainText("hotfix, the refund wording is wrong in production");
  });

  // ── C5: Undo ───────────────────────────────────────────────────────────────────────────────────

  test("Undo moves Live back, needs its own reason, and both rows stay in the history", async ({ page }) => {
    const promptId = await publishable(page, "Undoable");

    await page.goto(`/app/pr/${promptId}/deploy`);
    await page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ }).click();
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText("Live v1");

    // A second version, so there is somewhere to go back to.
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund date.");
    await page.goto(`/app/pr/${promptId}/deploy`);
    await page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ }).click();
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText("Live v2");

    // Undo asks for a reason of its own (EPIC-051 ruling 3) before it will do anything.
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("button", { name: "Undo to the version before" })).toBeDisabled();
    await page.getByLabel(/Say why Live is going back/).fill("latency spike on Gemini after the change");
    await page.getByRole("button", { name: "Undo to the version before" }).click();

    // Live reverts, and the log grew rather than being rewritten.
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText("Live v1");
    await expect(page.locator(".deploy-historytable tbody tr")).toHaveCount(3);
    await expect(page.locator(".deploy-historytable tbody tr").first()).toContainText("Undone");
    await expect(page.locator(".deploy-historytable tbody tr").first()).toContainText(
      "latency spike on Gemini after the change",
    );
  });

  // ── C14: the editor header ─────────────────────────────────────────────────────────────────────

  test("the editor header names the version and reaches Deploy", async ({ page }) => {
    const promptId = await publishable(page, "Headed");

    await page.goto(`/app/pr/${promptId}`);
    await expect(page.locator(".app-state")).toHaveText(/^Draft v\d+$/);

    await page.getByRole("link", { name: "Publish…" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/pr/${promptId}/deploy$`));
    await page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ }).click();
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText("Live v1");

    // Back on the canvas, the header now carries both, in one vocabulary.
    await page.goto(`/app/pr/${promptId}`);
    await expect(page.locator(".app-state")).toContainText("Draft v");
    await expect(page.locator(".app-state").getByRole("link", { name: /^Live v\d+$/ })).toBeVisible();
  });

  // ── C9 and C18 ─────────────────────────────────────────────────────────────────────────────────

  test("the apps-resolving card is absent and explained, not empty", async ({ page }) => {
    const promptId = await publishable(page, "Unmeasured");
    await page.goto(`/app/pr/${promptId}/deploy`);

    const card = page.getByRole("region", { name: "Apps calling this prompt" });
    await expect(card).toBeVisible();
    await expect(card).toContainText(/network does not exist yet/);
    await expect(card).toContainText(/Nothing is counted by asking your application/);

    // The control: there is genuinely no table in it, and the probe can find a table when there is
    // one — the publish history below has one.
    await expect(card.locator("table")).toHaveCount(0);
    await expect(page.locator(".deploy-history")).toBeVisible();
  });

  test("works at 390px and by keyboard", async ({ page }) => {
    const promptId = await publishable(page, "Narrow");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/pr/${promptId}/deploy`);

    await expectNoHorizontalOverflow(page);

    // Publish is reachable by keyboard alone and its touch target is 44px.
    const publish = page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ });
    await publish.focus();
    await expect(publish).toBeFocused();
    const box = await publish.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await page.keyboard.press("Enter");
    await expect(page.locator(".deploy-env-live .deploy-env-version")).toHaveText("Live v1");
  });
});
