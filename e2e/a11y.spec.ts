import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/* Automated accessibility checks (axe) on every app screen. Serious and
   critical violations fail the suite. */

async function audit(page: Page, label: string) {
  // Let entrance animations (opacity) finish so contrast is measured at rest.
  await page.waitForTimeout(900);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${label}: ${v.id} ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

test("sign-in, library, new, editor and settings have no serious accessibility violations", async ({ page }) => {
  await page.goto("/sign-in");
  await audit(page, "sign-in");
  await signIn(page, uniqueEmail("a11y"));
  await audit(page, "library-empty");
  await page.goto("/new");
  await audit(page, "new");
  await page.getByLabel("Your prompt").fill("You are a helpful assistant for {{shop}}.\n\nKeep replies short.");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/p\//);
  await audit(page, "editor");
  await page.getByRole("tab", { name: /History/ }).click();
  await audit(page, "editor-history");
  await page.goto("/");
  await audit(page, "library");
  await page.goto("/settings");
  await audit(page, "settings");
});
