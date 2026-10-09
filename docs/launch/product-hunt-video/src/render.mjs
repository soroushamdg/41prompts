// Renders the launch film frame by frame (deterministic, 60 fps) and muxes the score.
// node render.mjs                     full film → ../41prompts-launch-film.mp4
// node render.mjs --stills 2.6,5.4    PNG stills → ../preview/
// node render.mjs --from 20 --to 24   a slice, for checking motion
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const FPS = 60, LENGTH = 30, W = 1920, H = 1080;
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const cues = fs.readFileSync(path.join(root, "cues.json"), "utf8");

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  await page.addInitScript(`window.CUES = ${cues};`);
  await page.goto("file://" + path.join(here, "film.html"));
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.render(0));
  return page;
}

function ffmpeg(args) {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));
  return { p, done };
}

const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text"] });

if (arg("--stills")) {
  const page = await openPage(browser);
  const dir = path.join(root, "preview");
  fs.mkdirSync(dir, { recursive: true });
  for (const s of arg("--stills").split(",")) {
    const t = Number(s);
    await page.evaluate((t) => window.render(t), t);
    const file = path.join(dir, `still-${t.toFixed(2).padStart(5, "0")}.png`);
    await page.screenshot({ path: file });
    console.log("wrote", file);
  }
  await browser.close();
  process.exit(0);
}

const from = Number(arg("--from") ?? 0), to = Number(arg("--to") ?? LENGTH);
const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
const workers = Math.max(1, Math.min(Number(arg("--workers") ?? 4), os.cpus().length));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "film-"));
const per = Math.ceil((f1 - f0) / workers);
const t0 = Date.now();

await Promise.all(Array.from({ length: workers }, async (_, w) => {
  const a = f0 + w * per, b = Math.min(f1, a + per);
  if (a >= b) return;
  const page = await openPage(browser);
  const enc = ffmpeg(["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    path.join(tmp, `seg${String(w).padStart(2, "0")}.mp4`)]);
  for (let f = a; f < b; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: "png" });
    if (!enc.p.stdin.write(buf)) await new Promise((r) => enc.p.stdin.once("drain", r));
    if ((f - a) % 120 === 0) console.log(`worker ${w}: frame ${f} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  enc.p.stdin.end();
  await enc.done;
}));
await browser.close();

const segs = fs.readdirSync(tmp).filter((f) => f.startsWith("seg")).sort();
fs.writeFileSync(path.join(tmp, "list.txt"), segs.map((s) => `file '${path.join(tmp, s)}'`).join("\n"));
const out = arg("--out") ?? path.join(root, from === 0 && to === LENGTH ? "41prompts-launch-film.mp4" : `slice-${from}-${to}.mp4`);
const score = path.join(root, "audio", "score.wav");
const withAudio = fs.existsSync(score);
const mux = ["-y", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "list.txt")];
if (withAudio) mux.push("-ss", String(from), "-t", String(to - from), "-i", score, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k");
mux.push("-c:v", "copy", "-movflags", "+faststart", out);
const m = ffmpeg(mux); m.p.stdin.end(); await m.done;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${out}${withAudio ? " (with score)" : " (no score yet)"} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
