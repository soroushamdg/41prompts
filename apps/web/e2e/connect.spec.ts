import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser } from "./db";
import { expectNoHorizontalOverflow } from "./overflow";
import { addBlok, newPrompt, signIn } from "./runs-helpers";

/**
 * The Connect page (EPIC-055 C7, C9).
 *
 * The **steps** are pinned to `packages/sdk-ts/README.md` by `lib/connect/steps.test.ts`, which is a
 * unit test because it is a comparison of two files and needs no browser. What this spec owes is
 * that the page renders them, that the generated file is built from this project's real rows, and
 * that the absent apps-resolving card is absent for the stated reason.
 */

const OWNER_EMAIL = `connect-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-connect-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

/** A prompt with a declared variable, and the id of the project it is in. */
async function projectWithPrompt(page: Page, name: string): Promise<{ projectId: string; promptId: string }> {
  const promptId = await newPrompt(page, name);
  await addBlok(page, "context", "You answer refund questions for {{customer_name}}.");
  await page.getByRole("tab", { name: "Variables" }).click();
  await page.getByRole("button", { name: "Declare customer_name" }).click();
  await expect(
    page.getByRole("region", { name: "Declared variables" }).getByText("customer_name", { exact: true }),
  ).toBeVisible();

  // `exact`, because the chrome's "Projects" link also matches a loose name and Playwright's strict
  // mode then refuses — which is the right behaviour and was a bug in this helper, not in the page.
  await page.getByRole("link", { name: "Project", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);
  return { projectId: page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!, promptId };
}

test.describe("Connect", () => {
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

  test("shows four TypeScript steps that work today", async ({ page }) => {
    const { projectId } = await projectWithPrompt(page, "Connectable");
    await page.goto(`/app/p/${projectId}/connect`);

    await expect(page.getByRole("heading", { name: "Connect" })).toBeVisible();
    await expect(page.locator(".connect-step")).toHaveCount(4);

    await expect(page.getByText("npm install @41prompts/sdk")).toBeVisible();
    await expect(page.getByText("FORTYONE_API_KEY=41p_live_…")).toBeVisible();
    await expect(page.getByText(/createClient\(\{ apiKey: process\.env\.FORTYONE_API_KEY \}\)/).first()).toBeVisible();
    // The prompt id is named, and that is the assertion. EPIC-054's drive found the bare
    // `refresh()` this step used to print fetches nothing on a client that has just been built,
    // so an application following the instruction got the cold start the step exists to avoid.
    await expect(page.getByText('await prompts.refresh("pr_1a2b3c4d");')).toBeVisible();
    await expect(page.getByText("await prompts.refresh();")).toHaveCount(0);

    // TypeScript only (the roadmap's Goal line). No Python, no Swift, and no language tabs.
    await expect(page.getByText("pip install", { exact: false })).toHaveCount(0);
    await expect(page.locator('[role="tab"]')).toHaveCount(0);
  });

  test("prints the telemetry header exactly, and says it is off", async ({ page }) => {
    const { projectId } = await projectWithPrompt(page, "Quiet");
    await page.goto(`/app/p/${projectId}/connect`);

    const card = page.getByRole("region", { name: "What we send" });
    await expect(card).toContainText("Nothing, unless you turn it on");
    await expect(card).toContainText("41p-client: ts/0.1.0/node22/3f5b9c31-0a44-4d6e-9f11-2a7c8e4d6b01");
  });

  test("generates prompts.ts from this project's own rows", async ({ page }) => {
    const { projectId, promptId } = await projectWithPrompt(page, "Refund classifier");
    await page.goto(`/app/p/${projectId}/connect`);

    const file = await page.getByTestId("generated-file").textContent();
    expect(file).toContain(`prompts.resolve("${promptId}"`);
    expect(file).toContain("export function refundClassifier(v: { customer_name: string })");
    expect(file).toContain('import { createClient } from "@41prompts/sdk";');

    // EPIC-053 ruling 9 replaced EPIC-055's header with `docs/roadmap.md`'s ownership sentence,
    // because a file a command now writes into your repository should say who owns it.
    expect(file).toContain("This file is yours; 41Prompts claims no rights in it.");
    expect(file).not.toContain("copy this into your project");

    // The file still does not credit a tool. `41p pull` writes these bytes — the generator is one
    // function in `@41prompts/core` and the page and the command are two callers — but the file is
    // the project's, not the command's, and a header claiming otherwise would be the mockup's
    // mistake reintroduced. The *page* names the command; the file does not.
    expect(file).not.toContain("41p pull");
    await expect(page.getByText("41p pull")).toBeVisible();

    // The prompt table carries the same facts the file does.
    const row = page.locator(".connect-prompts tbody tr").filter({ hasText: promptId });
    await expect(row).toContainText("customer_name");
    await expect(row).toContainText("not published");
  });

  /**
   * The defect EPIC-055's drive found, as a test.
   *
   * A prompt that uses `{{…}}` and never declares the name still needs that value. Generating the
   * signature from declarations alone produced a function a developer cannot pass the name to, and
   * the model then receives the prompt with the placeholder still in it — the failure
   * `packages/sdk-ts/README.md` says nobody notices for a week.
   */
  test("takes a used-but-undeclared variable, and marks it in the table", async ({ page }) => {
    const promptId = await newPrompt(page, "Undeclared");
    // Two names, one declared and one not, so the file has to distinguish them rather than
    // include-everything or include-nothing.
    await addBlok(page, "context", "Write to {{customer_name}} about order {{order_id}}.");
    await page.getByRole("tab", { name: "Variables" }).click();
    await page.getByRole("button", { name: "Declare order_id" }).click();
    await expect(
      page.getByRole("region", { name: "Declared variables" }).getByText("order_id", { exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Project", exact: true }).click();
    const projectId = page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!;
    await page.goto(`/app/p/${projectId}/connect`);

    const file = await page.getByTestId("generated-file").textContent();
    // Both names are in the signature; the undeclared one is required, because optionality comes
    // from a default and it has none.
    expect(file).toContain("customer_name: string");
    expect(file).toContain("order_id: string");
    expect(file).not.toContain("customer_name?");

    // And the page says which one has no contract, rather than quietly papering over it.
    const row = page.locator(".connect-prompts tbody tr").filter({ hasText: promptId });
    await expect(row).toContainText("customer_name — not declared");
    await expect(row.locator(".connect-undeclared")).toHaveCount(1);

    // The control: `order_id` is declared, so it is *not* marked — the marker distinguishes rather
    // than decorating every name.
    await expect(row).not.toContainText("order_id — not declared");
  });

  test("says a project with no prompts has none, rather than emitting an empty module", async ({ page }) => {
    await page.goto("/app/projects");
    await page.getByLabel("New project").fill(`Empty ${Date.now()}`);
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);
    const projectId = page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!;

    await page.goto(`/app/p/${projectId}/connect`);
    const file = await page.getByTestId("generated-file").textContent();
    expect(file).toContain("This project has no prompts yet");
    expect(file).not.toContain("createClient");
    // Scoped to the card: the generated file's own comment says "has no prompts yet" too, and a
    // loose `getByText` matches both. Two elements is strict mode doing its job.
    await expect(
      page.getByRole("region", { name: "Prompts in this project" }).getByText("No prompts yet."),
    ).toBeVisible();
  });

  test("the apps-resolving card is absent and explained", async ({ page }) => {
    const { projectId } = await projectWithPrompt(page, "Uncounted");
    await page.goto(`/app/p/${projectId}/connect`);

    const card = page.getByRole("region", { name: "Apps calling these prompts" });
    await expect(card).toContainText(/network does not exist/);
    await expect(card).toContainText(/No application is ever asked to report itself/);
    await expect(card.locator("table")).toHaveCount(0);

    // The control: the probe can find a table on this page — the prompt list is one.
    await expect(page.locator(".connect-prompts")).toBeVisible();
  });

  test("is reachable from the project page and works at 390px", async ({ page }) => {
    const { projectId } = await projectWithPrompt(page, "Narrow connect");

    // A page nothing links to is a page nobody finds (`PROCESS.md`, the `/app` dead end).
    await page.goto(`/app/p/${projectId}`);
    // `exact`, because the prompt in this test is called "Narrow connect" and its link matches a
    // loose name too.
    await page.getByRole("link", { name: "Connect", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/app/p/${projectId}/connect$`));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app/p/${projectId}/connect`);
    await expectNoHorizontalOverflow(page);
  });
});
