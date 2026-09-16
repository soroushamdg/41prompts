import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PLACEHOLDER_MASTER_SECRET } from "@41prompts/db";
import { deleteTestUser, providerKeysFor, runsFor } from "./db";
import { addBlok, declare, newPrompt, signIn, uploadCsv } from "./runs-helpers";
import { startWorker, type RunningWorker } from "./worker-process";

/**
 * Bringing your own key, and reading one run two ways (EPIC-042).
 *
 * ## Nothing here reaches a provider
 *
 * The web verifies a pasted key with `FAKE_PROVIDER=1`, set on the web server in
 * `playwright.config.ts`: a key beginning `not-a-key-` is rejected and anything else is accepted.
 * The worker runs with the same flag, so the model calls are the deterministic echo. What this
 * suite proves is the **pipeline** — that a rejected key stores nothing, that a stored key is
 * sealed, that three keys make three runs and one matrix — and not that any provider likes any key.
 *
 * ## The worker gets the secret half and the web does not
 *
 * That is threat-model row `043a`, exercised rather than asserted: the web has only
 * `KEY_ENCRYPTION_PUBLIC_KEY` (from `env.mjs`, via `placeholders()`), so if sealing needed the
 * secret these tests would fail. `apps/web/no-key-opening.test.ts` is the other half of the same
 * claim.
 */

const OWNER_EMAIL = `providers-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-providers-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

const GOOD_KEY = "sk-e2e-a-perfectly-plausible-key-0001";
const BAD_KEY = "not-a-key-at-all-0000000000";
const CSV = "answer\nAll good.\nStill fine.\n";

let worker: RunningWorker;

/**
 * **Every test here builds the keys it needs, and none inherits one from the test before it.**
 *
 * That costs a few hundred milliseconds and it was learned the expensive way. The first version of
 * this file stored a key in one test and used it in three more. One real defect — the worker's
 * test-key job reaching an actual provider — made a single test time out, and **Playwright shuts
 * its worker down after a timeout and starts a fresh one, re-running `beforeAll`**. `beforeAll`
 * signs in as `providers-${Date.now()}`, so the replacement worker had a *different* user, and the
 * three tests that depended on the first user's key failed for a reason that had nothing to do with
 * them. One defect, four failures, three of them fiction.
 *
 * This is `docs/PROCESS.md`'s "a helper that normalises state" in its other form: not a helper that
 * hides a defect, but shared state that manufactures three. The rule that comes out of it is the
 * same shape — **a test asserts about state it created itself.**
 */

async function save(page: Page, title: string, key: string): Promise<void> {
  await page.getByLabel(`${title} API key`).fill(key);
  await page.getByRole("button", { name: `Save ${title} key` }).click();
}

/**
 * Store a key at this provider if there is not one already, and wait until the page says so.
 *
 * Idempotent, so a test can ask for whatever it needs without knowing what ran before — which is
 * the property the note above is about.
 */
async function ensureKey(page: Page, title: string): Promise<void> {
  await page.goto("/app/settings/providers");
  const four = page.getByTestId(`last-four-${title.toLowerCase()}`);
  if ((await four.count()) === 0) await save(page, title, GOOD_KEY);
  await expect(four).toBeVisible();
}

test.describe("provider keys and the two pivots", () => {
  test.beforeAll(async ({ browser }) => {
    // The secret half, because this worker has to open a stored key for the test-key job.
    // From `@41prompts/db` and not from `env.mjs`: Playwright transpiles a spec's imports to
    // CommonJS, where an ESM `.mjs` module is a syntax error at load — the same trap
    // `worker-process.ts` records about `import.meta`. `apps/web/e2e-env.test.ts` pins the two
    // copies of this value together, so there is one source either way.
    worker = await startWorker({ FAKE_PROVIDER: "1", KEY_ENCRYPTION_SECRET: PLACEHOLDER_MASTER_SECRET });
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

  test("is reachable from the chrome on every signed-in page", async ({ page }) => {
    await page.goto("/app/projects");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/app\/settings\/providers$/);
    await expect(page.getByRole("heading", { name: "Providers", level: 1 })).toBeVisible();
    // EPIC-043's guidance module, on its second render site.
    await expect(page.getByText("Set a spending limit on that key at your provider.")).toBeVisible();
  });

  test("refuses a key the provider will not take, and stores nothing", async ({ page }) => {
    await page.goto("/app/settings/providers");
    await save(page, "OpenAI", BAD_KEY);

    await expect(page.getByTestId("message-openai")).toContainText("OpenAI did not recognise that key");
    await expect(page.getByTestId("message-openai")).toContainText("Nothing was saved");
    // The claim a message cannot make on its own.
    expect(await providerKeysFor(OWNER_EMAIL)).toHaveLength(0);
  });

  test("stores a key sealed, shows four characters of it, and switches it off and on", async ({ page }) => {
    await page.goto("/app/settings/providers");
    await save(page, "Anthropic", GOOD_KEY);

    await expect(page.getByTestId("last-four-anthropic")).toContainText(GOOD_KEY.slice(-4));

    const [stored] = await providerKeysFor(OWNER_EMAIL);
    expect(stored!.provider).toBe("anthropic");
    expect(stored!.lastFour).toBe(GOOD_KEY.slice(-4));
    // Ciphertext, and a versioned envelope rather than anything resembling the key.
    expect(stored!.sealed).not.toContain(GOOD_KEY);
    expect(stored!.sealed.startsWith("41pk1.")).toBe(true);
    expect(stored!.enabled).toBe(true);

    const toggle = page.getByRole("switch", { name: "Use your Anthropic key" });
    await toggle.click();
    await expect(page.getByText("Switched off")).toBeVisible();
    expect((await providerKeysFor(OWNER_EMAIL))[0]!.enabled).toBe(false);
    // Switched off is not removed: the row and its envelope are untouched.
    expect((await providerKeysFor(OWNER_EMAIL))[0]!.sealed).toBe(stored!.sealed);

    await toggle.click();
    await expect(page.getByText("In use")).toBeVisible();
  });

  /** The queued half: opening a stored key is the worker's, so the verdict arrives later. */
  test("tests a stored key through the worker and shows what it said", async ({ page }) => {
    await ensureKey(page, "Anthropic");
    await page.getByRole("button", { name: "Test Anthropic key" }).click();

    await expect(page.getByTestId("verdict-anthropic")).toContainText("This key works", { timeout: 30_000 });
    await expect(page.getByTestId("verdict-anthropic").locator(".status-icon")).toHaveText("✓");
  });

  test("forgets a key on request, and says what that does not do", async ({ page }) => {
    await ensureKey(page, "Google");
    const before = (await providerKeysFor(OWNER_EMAIL)).map((key) => key.provider);
    expect(before).toContain("google");

    await page.getByRole("button", { name: "Remove Google key" }).click();
    await expect(page.getByTestId("message-google")).toContainText("until you revoke it there");

    // Google goes and nothing else does — the assertion a "there is one key left" check cannot make.
    const after = (await providerKeysFor(OWNER_EMAIL)).map((key) => key.provider);
    expect(after).not.toContain("google");
    expect(after).toEqual(before.filter((provider) => provider !== "google"));
  });

  test("runs once at every provider you have a key for, and lays the result out both ways", async ({ page }) => {
    // Three keys, so the button appears and the matrix has three columns.
    for (const title of ["Anthropic", "OpenAI", "Google"]) await ensureKey(page, title);

    const promptId = await newPrompt(page, "Matrix");
    await addBlok(page, "expected", 'Never mention "sorry".');
    await addBlok(page, "expected", "Reply in at most 30 words.");
    await addBlok(page, "context", "{{answer}}");
    await declare(page, "answer");
    await uploadCsv(page, promptId, "inputs.csv", CSV);

    await page.getByRole("button", { name: "Run inputs.csv on every provider" }).click();
    await expect(page).toHaveURL(/\/runs\/srun_[0-9a-f]{16}$/);
    await expect(page.locator(".app-state")).toContainText("Finished", { timeout: 90_000 });

    // Three runs, one comparison — a database fact the page could not distinguish from three
    // coincidental runs.
    const runs = await runsFor(promptId);
    expect(runs).toHaveLength(3);
    expect(new Set(runs.map((run) => run.comparison)).size).toBe(1);
    expect(runs[0]!.comparison).not.toBeNull();

    const matrix = page.getByRole("region", { name: "Every provider, by check" });
    await expect(matrix).toBeVisible();
    await expect(matrix.getByRole("columnheader")).toHaveCount(4); // the check, plus three providers
    for (const label of ["Anthropic", "OpenAI", "Google"]) {
      await expect(matrix.getByRole("columnheader", { name: new RegExp(label) })).toBeVisible();
    }
    // Two checks, two rows, and every cell says its counts in words rather than only in colour.
    await expect(matrix.getByRole("row")).toHaveCount(3);
    await expect(matrix.getByText("2 of 2 passed").first()).toBeVisible();

    // ── the pivots ────────────────────────────────────────────────────────────────────────────
    await expect(page.getByRole("tab", { name: "By check" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "By input" }).click();
    await expect(page.getByRole("tabpanel", { name: "By input" })).toBeVisible();

    const heatmap = page.getByTestId("heatmap");
    await expect(heatmap).toBeVisible();
    // Two checks by two inputs, every cell a button with the input number and the verdict in its
    // name (rule 10: never by colour alone).
    await expect(heatmap.getByRole("button")).toHaveCount(4);
    await expect(heatmap.getByRole("button", { name: "input 1, pass" })).toHaveCount(2);
    await expect(heatmap.getByRole("button", { name: "input 2, pass" })).toHaveCount(2);

    // The shape difference is real CSS and not only a class name.
    const background = await heatmap
      .getByRole("button", { name: "input 1, pass" })
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");

    // ── the keyboard path, on the run this test just made ─────────────────────────────────────
    //
    // In this test rather than its own, because its own would have to build a second
    // three-provider run for an assertion about arrow keys — and, more to the point, because a
    // test that reads state another test created is the thing the note at the top of this file is
    // about.
    const heatButtons = heatmap.getByRole("button");
    await heatButtons.first().focus();
    await expect(heatButtons.first()).toBeFocused();

    // Exactly one cell is in the tab order at a time — the roving tabindex. Six hundred tab stops
    // would be a keyboard trap rather than keyboard access.
    await expect(heatmap.locator('button[tabindex="0"]')).toHaveCount(1);

    await page.keyboard.press("ArrowRight");
    await expect(heatmap.getByRole("button", { name: "input 2, pass" }).first()).toBeFocused();

    await page.keyboard.press("Enter");
    const detail = page.getByTestId("heat-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Input 2");
    await expect(detail).toContainText("passed");

    await page.keyboard.press("ArrowDown");
    await expect(heatmap.getByRole("button", { name: "input 2, pass" }).nth(1)).toBeFocused();

    // Home goes to the start of the row it is in, not to the start of the grid.
    await page.keyboard.press("Home");
    await expect(heatmap.getByRole("button", { name: "input 1, pass" }).nth(1)).toBeFocused();
  });
});
