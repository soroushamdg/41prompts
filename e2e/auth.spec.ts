import { expect, test } from "@playwright/test";
import { latestLink, signIn } from "./helpers";

test("signed-out visitors are sent to sign-in, keeping where they were going", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings$/);
  await expect(page.getByRole("heading", { name: "Sign in to 41prompts" })).toBeVisible();
});

test("#start shows the sign-up heading", async ({ page }) => {
  await page.goto("/sign-in#start");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});

test("a bad email is caught before anything is sent", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter an email address like you@company.com.");
});

test("magic link signs up, works once, and signs out", async ({ page }) => {
  const email = await signIn(page);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

  // The same link cannot be used twice.
  const link = await latestLink(email);
  await page.context().clearCookies();
  await page.goto(link);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/sign-in\?error=link/);
  await expect(page.getByRole("alert")).toContainText("expired or was already used");

  // Sign in again, then sign out from the account menu.
  await signIn(page, email);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});

