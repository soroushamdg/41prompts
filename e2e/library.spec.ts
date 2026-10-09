import { expect, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

const PASTE = `You are the order assistant for Northwind Outfitters.

When a customer asks about an order, look up {{order_id}} and greet them as {{customer_name}}.

Keep replies under 80 words.`;

test("paste a prompt, then rename, duplicate, archive and delete it with undo", async ({ page }) => {
  await signIn(page, uniqueEmail("library"));
  await expect(page.getByRole("heading", { name: "Your library is empty." })).toBeVisible();

  await page.getByRole("link", { name: "New prompt" }).first().click();
  await page.getByLabel("Your prompt").fill(PASTE);
  await expect(page.locator(".var", { hasText: "{{order_id}}" })).toBeVisible();
  await expect(page.locator(".var", { hasText: "{{customer_name}}" })).toBeVisible();
  await page.getByLabel("Name").fill("Order Status Reply");
  await page.getByLabel("Name").blur();
  await expect(page.getByLabel("Name")).toHaveValue("order-status-reply");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/p\/order-status-reply$/);

  await page.goto("/");
  const row = page.locator("tr", { hasText: "order-status-reply" });
  await expect(row).toContainText("You are the order assistant for Northwind Outfitters.");

  await row.getByRole("button", { name: "Duplicate order-status-reply" }).click();
  await expect(page.locator("tr", { hasText: "order-status-reply-copy" })).toBeVisible();

  await page.getByRole("button", { name: "Rename order-status-reply-copy" }).click();
  await page.getByLabel("New name for order-status-reply-copy").fill("Refund Triage");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Renamed to refund-triage.")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.keyboard.type("refund");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("mark.hit")).toHaveText("refund");
  await page.getByLabel("Search prompts by name").fill("zzz");
  await expect(page.getByText("No prompt names match “zzz”.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();

  await page.getByRole("button", { name: "Delete refund-triage" }).click();
  await expect(page.locator("tr", { hasText: "refund-triage" })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("tr", { hasText: "refund-triage" })).toBeVisible();

  await page.getByRole("button", { name: "Archive refund-triage" }).click();
  await expect(page.locator("tr", { hasText: "refund-triage" })).toHaveCount(0);
  await page.getByRole("button", { name: "Archived · 1" }).click();
  await page.getByRole("button", { name: "Unarchive refund-triage" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);

  await page.reload();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("start blank from a chosen blok type", async ({ page }) => {
  await signIn(page, uniqueEmail("blank"));
  await page.goto("/new");
  await page.getByRole("tab", { name: "Start blank" }).click();
  await page.getByRole("radio", { name: /Expects/ }).click();
  await page.getByRole("button", { name: "Create blank prompt" }).click();
  await expect(page).toHaveURL(/\/p\/untitled-prompt$/);
});

test("the decompiler is a locked Performance control", async ({ page }) => {
  await signIn(page, uniqueEmail("locked"));
  await page.goto("/new");
  await page.getByRole("button", { name: "Performance" }).click();
  await expect(page.getByRole("heading", { name: "The decompiler is part of Performance." })).toBeVisible();
  await expect(page.locator("dialog[open]")).not.toContainText("$");
  await page.getByRole("button", { name: "Tell me when it opens" }).click();
  await expect(page.getByText("Noted. We will email you when it opens.")).toBeVisible();
});
