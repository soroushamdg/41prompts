/* Drive: every app screen at phone width (390×844): no horizontal scroll,
   layout stacks as the mockup's breakpoints say. Built app, E2E_MODE=1. */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { APP, check, signInViaOutbox } from "./lib.mjs";

mkdirSync(".drive/phone", { recursive: true });
const browser = await chromium.launch({ headless: process.env.DRIVE_HEADLESS === "1" });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
page.setDefaultTimeout(15000);
const noScroll = async (label) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(w <= 0, `${label}: no horizontal scroll (${w}px)`);
  await page.screenshot({ path: `.drive/phone/${label}.png`, fullPage: true });
};
try {
  await page.goto(`${APP}/sign-in`);
  await noScroll("sign-in");
  await signInViaOutbox(page, `phone-${Date.now()}@example.test`);
  await noScroll("library-empty");
  await page.goto(`${APP}/new`);
  await noScroll("new");
  await page.getByLabel("Your prompt").fill("You are a support agent for {{shop}}.\n\nReply in under 80 words.\n\nCustomer: hi");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/p\//);
  await page.waitForTimeout(1500);
  await noScroll("editor");
  await page.goto(`${APP}/`);
  await page.waitForTimeout(1200);
  await noScroll("library");
  await page.goto(`${APP}/settings`);
  await noScroll("settings");
  console.log("DRIVE PASS phone");
} catch (e) {
  console.error("DRIVE FAIL phone:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
