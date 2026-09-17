import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { signIn } from "./runs-helpers";

/**
 * Settings: the navigation, API keys, and the publishing switch (EPIC-055 C10–C13).
 *
 * ## Why this file signs in per test rather than sharing a storage state
 *
 * Every other settings spec reuses one signed-in context, which is faster. This one must not: a key
 * list is the state under test, and a shared account accumulates keys across tests until "the list
 * has one row" stops being true for reasons that have nothing to do with the test that broke.
 * `docs/AUTONOMOUS.md` makes the same argument about the drive's fresh user, and it is the reason the
 * `/app` dead end survived twenty epics.
 */

async function freshUser(page: Page, label: string): Promise<string> {
  const email = `settings-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  await signIn(page, email);
  return email;
}

/** A project, created the way a person creates one. Keys hang off a project. */
async function newProject(page: Page, name: string): Promise<void> {
  await page.goto("/app/projects");
  await page.getByLabel("New project").fill(`${name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);
}

test.describe("Settings", () => {
  const made: string[] = [];

  test.afterAll(async () => {
    for (const email of made) await deleteTestUser(email);
  });

  // ── C13: the navigation is links, not tabs ─────────────────────────────────────────────────────

  test("joins three pages with links and marks the one you are on", async ({ page }) => {
    made.push(await freshUser(page, "nav"));

    await page.goto("/app/settings/providers");
    const nav = page.getByRole("navigation", { name: "Settings" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Providers" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "API keys" })).not.toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "API keys" }).click();
    await expect(page).toHaveURL(/\/app\/settings\/keys$/);
    await expect(nav.getByRole("link", { name: "API keys" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "Publishing" }).click();
    await expect(page).toHaveURL(/\/app\/settings\/publishing$/);

    // Ruling 1: a control that changes the URL is a link, so nothing here is a tab.
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
    await expect(page.locator('[role="tablist"]')).toHaveCount(0);

    // The control for that absence. The run page genuinely has tabs, so the probe can find them —
    // without this, `toHaveCount(0)` would also pass against a selector that never matches anything.
    await page.goto("/app/projects");
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
  });

  test("the tab probe can find a real tab, so the absence above means something", async ({ page }) => {
    made.push(await freshUser(page, "control"));
    await newProject(page, "Tabbed");
    await page.getByLabel("New prompt").fill("Tabbed prompt");
    await page.getByRole("button", { name: "Create prompt" }).click();
    await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}/);

    // The workbench has real ARIA tabs. Same selector, same page object, non-zero count.
    await expect(page.locator('[role="tab"]').first()).toBeVisible();
    expect(await page.locator('[role="tab"]').count()).toBeGreaterThan(0);
  });

  // ── C10: shown once ────────────────────────────────────────────────────────────────────────────

  test("shows a minted key once and never again", async ({ page }) => {
    made.push(await freshUser(page, "mint"));
    await newProject(page, "Keyed");

    await page.goto("/app/settings/keys");
    await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
    await expect(page.getByText("No keys yet")).toBeVisible();

    await page.getByLabel(/^Name for a new key/).fill("api-gateway");
    await page.getByRole("button", { name: "New key" }).click();

    const minted = page.getByTestId("minted-key");
    await expect(minted).toBeVisible();
    const plaintext = (await minted.textContent())!.trim();
    expect(plaintext).toMatch(/^41p_live_[0-9a-f]{32}$/);
    await expect(page.getByText(/only time it is shown/).first()).toBeVisible();

    // Reload: the row is there, the secret is not. `createApiKey` keeps a digest and the last four.
    await page.reload();
    await expect(page.getByTestId("minted-key")).toHaveCount(0);
    await expect(page.getByText("api-gateway")).toBeVisible();
    await expect(page.getByText(`…${plaintext.slice(-4)}`)).toBeVisible();
    // The whole key is nowhere in the document — with a control that this search can find it.
    expect(await page.content()).not.toContain(plaintext);
    expect(`${await page.content()}${plaintext}`).toContain(plaintext);
  });

  test("mints a test key when asked for one, and refuses a key with no name", async ({ page }) => {
    made.push(await freshUser(page, "envs"));
    await newProject(page, "Environments");
    await page.goto("/app/settings/keys");

    await page.getByRole("button", { name: "New key" }).click();
    await expect(page.getByText(/Give the key a name/)).toBeVisible();
    await expect(page.getByTestId("minted-key")).toHaveCount(0);

    await page.getByLabel(/^Name for a new key/).fill("ci");
    await page.getByLabel(/^Environment for a new key/).selectOption("test");
    await page.getByRole("button", { name: "New key" }).click();
    await expect(page.getByTestId("minted-key")).toHaveText(/^41p_test_/);
  });

  // ── C11: rotate leaves two rows ────────────────────────────────────────────────────────────────

  test("rotating leaves the old row revoked with its dates, and a new one live", async ({ page }) => {
    made.push(await freshUser(page, "rotate"));
    await newProject(page, "Rotating");
    await page.goto("/app/settings/keys");

    await page.getByLabel(/^Name for a new key/).fill("api-gateway");
    await page.getByRole("button", { name: "New key" }).click();
    await expect(page.getByTestId("minted-key")).toHaveText(/^41p_live_[0-9a-f]{32}$/);
    const first = (await page.getByTestId("minted-key").textContent())!.trim();

    await page.getByRole("button", { name: "Rotate" }).click();
    // Wait on the real condition — the panel showing a *different* key — rather than reading the
    // node the instant the click lands. `textContent()` does not retry, so the first version of this
    // read the pre-rotation value and reported a defect in code that was correct.
    await expect(page.getByTestId("minted-key")).not.toHaveText(first);
    const second = (await page.getByTestId("minted-key").textContent())!.trim();
    expect(second).not.toBe(first);
    await expect(page.getByText(new RegExp(`key ending ${first.slice(-4)} has stopped working`))).toBeVisible();

    await page.reload();
    // Two rows: one live, one revoked and still readable.
    await expect(page.locator(".keys-row")).toHaveCount(2);
    await expect(page.locator(".keys-row-revoked")).toHaveCount(1);
    await expect(page.locator(".keys-row-revoked")).toContainText(`…${first.slice(-4)}`);
    await expect(page.locator(".keys-row-revoked .keys-row-stopped")).toContainText("Stopped");
    // The revoked row keeps the name it had: rotation replaces a credential, not its purpose.
    await expect(page.locator(".keys-row-revoked")).toContainText("api-gateway");
    // And it has no buttons — there is nothing left to do to it.
    await expect(page.locator(".keys-row-revoked").getByRole("button")).toHaveCount(0);
  });

  test("a revoked key stops authenticating /v1", async ({ page }) => {
    made.push(await freshUser(page, "revoke"));
    await newProject(page, "Revoking");
    await page.goto("/app/settings/keys");

    await page.getByLabel(/^Name for a new key/).fill("doomed");
    await page.getByRole("button", { name: "New key" }).click();
    await expect(page.getByTestId("minted-key")).toHaveText(/^41p_live_[0-9a-f]{32}$/);
    const key = (await page.getByTestId("minted-key").textContent())!.trim();

    // The control: it works before it is revoked. A 401 proves nothing if it always 401'd.
    const before = await page.evaluate(
      async (token) => (await fetch("/v1/prompts", { headers: { authorization: `Bearer ${token}` } })).status,
      key,
    );
    expect(before).toBe(200);

    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText(/That key has stopped working/)).toBeVisible();

    const after = await page.evaluate(
      async (token) => (await fetch("/v1/prompts", { headers: { authorization: `Bearer ${token}` } })).status,
      key,
    );
    expect(after).toBe(401);
  });

  // ── C12: the publishing switch ─────────────────────────────────────────────────────────────────

  test("toggles who may publish, and the value survives a reload", async ({ page }) => {
    made.push(await freshUser(page, "publishing"));
    await newProject(page, "Switchable");

    await page.goto("/app/settings/publishing");
    const toggle = page.getByRole("switch", { name: /^Only an admin can publish in Switchable/ });
    // Defaults on: the safe default for "who may change what production serves" is the narrow one.
    await expect(toggle).toHaveAttribute("aria-checked", "true");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await expect(page.getByRole("switch", { name: /^Only an admin can publish in Switchable/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("says rule 9 is not optional, rather than leaving the missing switch unexplained", async ({ page }) => {
    made.push(await freshUser(page, "rule9"));
    await page.goto("/app/settings/publishing");

    const section = page.getByRole("region", { name: "Failing checks" });
    await expect(section).toContainText("There is no switch for failing checks");
    await expect(section).toContainText("Publish anyway");

    // The control: there really is only one switch on this page, and the probe counts switches.
    await newProject(page, "Only one");
    await page.goto("/app/settings/publishing");
    await expect(page.getByRole("switch")).toHaveCount(1);
  });
});
