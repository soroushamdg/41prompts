/* Drive: model keys, a streamed run, export, and deleting the account.
   Against a built app started with E2E_MODE=1 (mock model, file outbox). */
import { APP, assertStyled, check, launch, signInViaOutbox } from "./lib.mjs";

const { browser, context, page, shot, errors } = await launch("m07-settings");
try {
  await signInViaOutbox(page, `keys-${Date.now()}@example.test`);
  await page.goto(`${APP}/settings`);
  await assertStyled(page);
  await shot("settings");

  await page.getByLabel("OpenAI API key").fill("sk-bad-key-for-test");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await page.getByText("OpenAI refused that key. Check it and try again.").waitFor();
  check(true, "a refused key is not saved");
  await page.getByLabel("OpenAI API key").fill("sk-proj-good-key-3f9a");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await page.getByText("Key ending 3f9a").waitFor();
  check(true, "key saved, shown only by its last four");
  await page.getByLabel("Anthropic API key").fill("sk-ant-good-key-8c1d");
  await page.getByRole("button", { name: "Save key" }).first().click();
  await page.getByText("Key ending 8c1d").waitFor();
  await page.getByRole("button", { name: "Test connection" }).first().click();
  await page.getByText("Works · 212 ms").waitFor();
  check(true, "test connection shows latency");
  await shot("keys-connected");
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

  // Remove a key with confirmation.
  await page.getByRole("button", { name: "Remove Anthropic key" }).click();
  await page.getByRole("button", { name: "Remove key" }).click();
  await page.getByText("Removed your Anthropic key.").waitFor();
  check(true, "a key is removed after confirming");

  // Delete the account.
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await shot("delete-ready");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL(/\/goodbye/);
  check((await page.locator("h1").textContent()) === "Your account is deleted.", "goodbye page in plain words");
  check((await page.locator("main, section").first().textContent()).includes("1 prompt, 1 version and 1 saved model key"), "says exactly what was removed");
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
