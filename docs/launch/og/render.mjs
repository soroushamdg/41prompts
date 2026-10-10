// Renders the social card (og:image) at 2x and writes the 1200x630 file the site serves.
// node docs/launch/og/render.mjs   → public/assets/og.png
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..");
const big = path.join(here, "og@2x.png");
const out = path.join(root, "public", "assets", "og.png");

const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto("file://" + path.join(here, "og.html"));
await page.waitForFunction(() => window.__ready === true);
await page.screenshot({ path: big });
await browser.close();

// Downscale with Lanczos for crisp type at the size platforms actually show.
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", big, "-vf", "scale=1200:630:flags=lanczos", "-frames:v", "1", "-pred", "mixed", out]);
console.log("wrote", out);
