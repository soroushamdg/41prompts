import { expect, type Page } from "@playwright/test";
import { latestMagicLinkTokenFor } from "./db";

/**
 * The shared journey for the runs specs: sign in, make a prompt, write bloks, declare a variable,
 * upload a CSV.
 *
 * **Nothing here reloads.** Every helper ends on a real condition — a URL, a saved state, a visible
 * element — rather than on a `page.reload()` or a `waitForTimeout`. `PROCESS.md`'s audit found the
 * same `addBlok` helper hiding two live defects in two files because it ended in a reload, and the
 * rule that came out of it is that a normalising line must justify itself. None of these needs one.
 */

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?next=%2Fapp%2Fprojects");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const token = await latestMagicLinkTokenFor(email);
  await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
  await expect(page).toHaveURL(/\/app\/projects/);
}

/** A fresh project and prompt, created the way a person creates them. Returns the prompt id. */
export async function newPrompt(page: Page, name: string): Promise<string> {
  await page.goto("/app/projects");
  await page.getByLabel("New project").fill(`${name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);
  await page.getByLabel("New prompt").fill(name);
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
  return page.url().split("/app/pr/")[1]!.split(/[/?#]/)[0]!;
}

export async function addBlok(page: Page, kind: string, text: string): Promise<void> {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await expect(page.locator(".canvas-list > li")).toHaveCount(before + 1);
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  // The real condition: the blok says it saved. No reload — see the note on this file.
  await expect(page.locator(".canvas-list > li").nth(before).locator(".blok-editor-state")).toHaveAttribute(
    "data-state",
    "saved"
  );
}

/** Declare a variable the prompt already uses, through the Variables tab, as a person would. */
export async function declare(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name: "Variables" }).click();
  await expect(page.getByRole("tabpanel", { name: "Variables" })).toBeVisible();
  await page.getByRole("button", { name: `Declare ${name}` }).click();
  await expect(page.getByRole("region", { name: "Declared variables" }).getByText(name, { exact: true })).toBeVisible();
}

/**
 * Upload a CSV and **wait for the page to have answered** — the set appearing, or the refusal.
 *
 * Waiting on one of those two is waiting on a real condition. Returning the moment the click lands
 * would leave the next assertion racing a `router.refresh()`, and the fix for that is a duration,
 * which is the thing `PROCESS.md` says not to write.
 */
export async function uploadCsv(page: Page, promptId: string, name: string, body: string): Promise<void> {
  await page.goto(`/app/pr/${promptId}/runs`);
  await page.getByLabel("CSV file").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body, "utf-8") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(setNamed(page, name).or(uploadMessage(page))).toBeVisible();
}

/** The set's own name cell, and not the two buttons whose accessible names also contain it. */
export function setNamed(page: Page, name: string) {
  return page.locator(".runs-set-name").filter({ hasText: new RegExp(`^${escapeForRegExp(name)}$`) });
}

/**
 * The refusal, and not Next's route announcer — which is also `role="alert"`, is always in the
 * document, and is empty, so a bare `getByRole("alert")` is ambiguous on every page of this app.
 */
export function uploadMessage(page: Page) {
  return page.locator(".app-form-message");
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
