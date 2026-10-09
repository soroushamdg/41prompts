/* Shared helpers for browser drives against the BUILT app (next start), never
   the dev server. Visible browser by default so the run can be watched;
   DRIVE_HEADLESS=1 for unattended runs. Screenshots go to .drive/<name>/. */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

export const APP = process.env.DRIVE_APP_URL || "http://localhost:3141";
export const SITE = process.env.DRIVE_SITE_URL || "http://site.localhost:3141";

export async function launch(name) {
  const dir = `.drive/${name}`;
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.DRIVE_HEADLESS === "1", slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 250 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  let n = 0;
  const shot = async (label, p = page) => {
    n += 1;
    const file = `${dir}/${String(n).padStart(2, "0")}-${label}.png`;
    await p.screenshot({ path: file });
    console.log("  shot", file);
    return file;
  };
  return { browser, context, page, shot, errors, dir };
}

/** Fails loudly if the stylesheet did not apply (the twenty-epic outage check). */
export async function assertStyled(page) {
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  if (bg !== "rgb(10, 24, 48)") throw new Error(`stylesheet not applied: body background is ${bg}`);
  if (!/plex/i.test(font)) throw new Error(`fonts not applied: body font is ${font}`);
}

export function check(cond, msg) {
  if (!cond) throw new Error(`check failed: ${msg}`);
  console.log("  ok", msg);
}
