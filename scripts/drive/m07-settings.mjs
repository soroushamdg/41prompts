/* Drive: a model, a streamed run, export, and deleting the account.
   Against a built app started with E2E_MODE=1 (mock model, file outbox).
   The add-model dialog itself is driven in depth by m16-models. */
import { addModel, APP, assertStyled, check, launch, signInViaOutbox } from "./lib.mjs";

const { browser, context, page, shot, errors } = await launch("m07-settings");
try {
  await signInViaOutbox(page, `keys-${Date.now()}@example.test`);
  await page.goto(`${APP}/settings`);
  await assertStyled(page);
  await shot("settings");

  await addModel(page, { label: "Work GPT", key: "sk-proj-good-key-3f9a", model: "gpt-6.1-sol" });
  await addModel(page, { provider: "Anthropic", label: "Claude", key: "sk-ant-good-key-8c1d", model: "claude-sonnet-5-5" });
  await page.getByRole("button", { name: "Test Work GPT" }).click();
  await page.locator('[data-model="Work GPT"]').getByText("Works · 212 ms").waitFor();
  check(true, "test shows latency");
  await shot("models-connected");
  check(!(await page.content()).includes("good-key"), "the key never comes back to the page");

  // A run on the mock model.
  await page.goto(`${APP}/new`);
  await page.getByLabel("Your prompt").fill("You are a support agent. Greet the customer as {{customer_name}}.");
  await page.getByLabel("Name").fill("run-check");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/p\/run-check$/);
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByText("{{customer_name}} has no value yet").waitFor();
  check(true, "warns about an unfilled variable");
  await page.getByLabel("Test message").fill("My order has not shipped. Can I get my money back?");
  await page.getByRole("button", { name: "Run once" }).click();
  await page.waitForTimeout(700);
  await shot("run-streaming");
  await page.getByRole("button", { name: "Run again" }).waitFor({ timeout: 15000 });
  const out = await page.locator('[aria-live="polite"]').filter({ hasText: "Hi Sam" }).first().textContent();
  check(out.includes("replacement or a return"), "the reply streamed in full");
  const stats = await page.locator('[class*="runstats"]').textContent();
  check(/Tokens\s*\d/.test(stats) && /ms/.test(stats) && /\$/.test(stats), `stats shown (${stats.replace(/\s+/g, " ").trim()})`);
  await shot("run-done");

  // Export.
  await page.goto(`${APP}/settings#data`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  check(/41prompts-export-\d{4}-\d{2}-\d{2}\.zip/.test(download.suggestedFilename()), `export downloads ${download.suggestedFilename()}`);
  await page.getByText(/Ready · 41prompts-export/).waitFor();
  await shot("export-ready");

  // Remove a model with confirmation.
  await page.getByRole("button", { name: "Remove Claude" }).click();
  await page.getByRole("button", { name: "Remove model" }).click();
  await page.getByText("Removed Claude.").waitFor();
  check(true, "a model is removed after confirming");

  // Delete the account.
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await shot("delete-ready");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL(/\/goodbye/);
  check((await page.locator("h1").textContent()) === "Your account is deleted.", "goodbye page in plain words");
  check((await page.locator("main, section").first().textContent()).includes("1 prompt, 1 version and 1 saved model"), "says exactly what was removed");
  await shot("goodbye");
  await page.goto(`${APP}/`);
  check(page.url().includes("/sign-in"), "signed out after deletion");
  const keysLeft = await context.storageState();
  check(!JSON.stringify(keysLeft.origins).includes("41p:draft"), "local drafts are cleared");
  check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
  console.log("DRIVE PASS m07-settings");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL m07-settings:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
