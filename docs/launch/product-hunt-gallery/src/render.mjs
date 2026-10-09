// Renders every gallery page to a 2x PNG (2540×1520, Product Hunt's 1270×760 ratio).
// Usage: node render.mjs [page-number ...]
import { fileURLToPath } from "node:url";
import path from "node:path";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..");
export const PAGES = [
  ["01", "41prompts-prompt-testing-gpt-claude-gemini"],
  ["02", "41prompts-prompt-editor-bloks-compiled-prompt"],
  ["03", "41prompts-llm-failure-attribution"],
  ["04", "41prompts-prompt-linter"],
  ["05", "41prompts-cross-model-llm-evaluation"],
  ["06", "41prompts-free-prompt-library-version-control"],
];

const only = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error("console:", m.text()); });
for (const [n, name] of PAGES) {
  if (only.length && !only.includes(n)) continue;
  await page.goto("file://" + path.join(here, `${n}.html`));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  const file = path.join(out, `${n}-${name}.png`);
  await page.screenshot({ path: file, type: "png" });
  console.log("wrote", file);
}
await browser.close();
