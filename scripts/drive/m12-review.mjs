/* Drive: the Product Hunt review dialog after a finished run (account aged
   by two days in the local database). Built app with E2E_MODE=1. */
import pg from "pg";
import { addModel, APP, check, launch, signInViaOutbox } from "./lib.mjs";

const { browser, page, shot, errors } = await launch("m12-review");
try {
  const email = `review-${Date.now()}@example.test`;
  await signInViaOutbox(page, email);
  const c = new pg.Client({ connectionString: process.env.DRIVE_DATABASE_URL });
  await c.connect();
  await c.query(`update "user" set created_at = now() - interval '2 days' where email = $1`, [email]);
  await c.end();
  await addModel(page, { label: "Work GPT", key: "sk-proj-good-key-1111", model: "gpt-6.1-sol" });
  await page.goto(`${APP}/new`);
  await page.getByLabel("Your prompt").fill("You are a support agent for Northwind Outfitters.");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/p\//);
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByLabel("Test message").fill("Where is my order?");
  await page.getByRole("button", { name: "Run once" }).click();
  await page.getByRole("heading", { name: "Is 41prompts working for you?" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);
  await shot("review-dialog");
  await page.getByRole("button", { name: "Ask me later" }).click();
  await page.goto(`${APP}/settings#account`);
  await page.waitForTimeout(1500);
  await shot("settings-account");
  check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
  console.log("DRIVE PASS m12-review");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL m12-review:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
