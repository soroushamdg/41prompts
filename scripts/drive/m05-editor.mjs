/* Drive: sign in, paste a prompt, shape it into bloks, autosave, history.
   Against a built app started with E2E_MODE=1 (file outbox) on :3141. */
import { APP, assertStyled, check, launch, signInViaOutbox } from "./lib.mjs";

const PASTE = `You are a support agent for Northwind Outfitters, an outdoor gear shop.

Reply in under 80 words. Greet the customer as {{customer_name}}.

Customer: My boots arrived in the wrong size.
Agent: Sorry about that, Sam. I have started an exchange for a size 10.`;

const { browser, page, shot, errors } = await launch("m05-editor");
try {
  await page.goto(`${APP}/sign-in`);
  await assertStyled(page);
  await page.waitForTimeout(5500); // Sheet 00 constructs itself
  await shot("sign-in");
  await signInViaOutbox(page, `drive-${Date.now()}@example.test`);
  await assertStyled(page);
  await shot("library-empty");

  await page.getByRole("link", { name: "New prompt" }).first().click();
  await page.getByLabel("Your prompt").fill(PASTE);
  await page.getByLabel("Name").fill("Support Reply");
  await shot("new-prompt");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/p\/support-reply$/);
  await page.waitForTimeout(1200);
  await assertStyled(page);
  check(await page.locator(".blok").count() === 1, "paste becomes one context blok");
  await shot("editor-v1");

  // Split the pasted blok at its paragraph breaks, using the Split tool.
  await page.getByRole("button", { name: "Split blok B1 at the cursor" }).click();
  await page.getByRole("button", { name: "Split blok B2 at the cursor" }).click();
  check(await page.locator(".blok").count() === 3, "split into three bloks");
  // Type the second and third bloks.
  await page.getByRole("button", { name: /Change the type of blok B2/ }).click();
  await page.getByRole("menuitemradio", { name: "Constraint" }).click();
  await page.getByRole("button", { name: /Change the type of blok B3/ }).click();
  await page.getByRole("menuitemradio", { name: "Example" }).click();
  check(await page.locator('.blok[data-id="B2"]').getAttribute("data-type") === "constraint", "B2 is a constraint");
  // Add an expects blok and type into it.
  await page.locator('[data-add="expects"]').click();
  await page.keyboard.type("Never promises a refund.");
  await page.waitForTimeout(1600);
  check((await page.getByRole("status").filter({ hasText: /Saved · v/ }).textContent()).includes("Saved · v"), "autosaved");
  const compiled = await page.locator('[aria-label="Compiled prompt"]').innerText();
  check(!compiled.includes("refund"), "expects never reach the compiled prompt");
  await page.locator('.blok[data-id="B2"]').hover();
  await page.waitForTimeout(300);
  check(await page.locator('[data-for="B2"]').evaluate((el) => el.classList.contains("is-hot")), "hover highlights the compiled span");
  await shot("editor-shaped");

  // Filled view with the variable value.
  await page.getByLabel("Variable · customer_name").fill("Sam");
  await page.getByRole("button", { name: "Filled" }).click();
  check((await page.locator('[aria-label="Compiled prompt"]').innerText()).includes("Greet the customer as Sam."), "filled view substitutes the variable");
  await shot("compiled-filled");

  // Keyboard reorder: move B3 up.
  await page.locator('[data-grip="B3"]').focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(500);
  const order = await page.locator(".blok").evaluateAll((els) => els.map((e) => e.getAttribute("data-id")).join());
  check(order.startsWith("B1,B3,B2"), `keyboard reorder (${order})`);

  // Delete with undo.
  await page.getByRole("button", { name: "Delete blok B4" }).click();
  await page.waitForTimeout(400);
  check(await page.locator('.blok[data-id="B4"]').count() === 0, "blok deleted");
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(700);
  check(await page.locator('.blok[data-id="B4"]').count() === 1, "undo brings the blok back");
  await page.waitForTimeout(1600);

  // History: versions accumulate; restore v1.
  await page.getByRole("tab", { name: /History/ }).click();
  await page.waitForTimeout(400);
  const rows = await page.locator('[class*="vrow"]').count();
  check(rows >= 2, `versions accumulate (${rows})`);
  await shot("history");
  await page.getByRole("button", { name: "Open v1 read-only" }).click();
  await page.waitForTimeout(600);
  check(await page.getByText("Viewing v1 · read-only").isVisible(), "old version opens read-only");
  await shot("viewing-v1");
  await page.getByRole("button", { name: "Restore v1" }).click();
  await page.waitForTimeout(800);
  check(await page.getByText(/Restored v1 as v\d+\. Nothing was overwritten\./).isVisible(), "restore creates a new version");
  check(await page.locator(".blok").count() === 1, "restored bloks are v1's");
  await shot("restored");

  // Reload: the head is the restored version.
  await page.reload();
  await page.waitForTimeout(800);
  check(await page.locator(".blok").count() === 1, "restore persisted");
  check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
  console.log("DRIVE PASS m05-editor");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL m05-editor:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
