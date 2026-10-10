// Renders the YouTube thumbnails at 2x; thumbnail.py then makes the 1280x720 files.
// node thumbnail.mjs  → ../preview/thumb-a@2x.png, ../preview/thumb-b@2x.png
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, "..", "preview");
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
for (const v of ["a", "b"]) {
  await page.goto("file://" + path.join(here, "thumbnail.html") + "?v=" + v);
  await page.waitForFunction(() => window.__ready === true);
  const file = path.join(dir, `thumb-${v}@2x.png`);
  await page.screenshot({ path: file });
  console.log("wrote", file);
}
await browser.close();
