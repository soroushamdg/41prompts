/**
 * EPIC-016c's drive: the capability rotator, as the mockup draws it, on the BUILT home page.
 *
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3131)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/016c.env
 *   set -a && . /tmp/016c.env && set +a
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p
 *   pnpm --filter @41prompts/web start --port 3131 &
 *   npx tsx scripts/drive-epic-016c.mts
 *
 * ## It does not sign in, for EPIC-016b's reason
 *
 * `docs/AUTONOMOUS.md` asks every drive to sign in as a fresh `claude-drive-…@example.com` user,
 * because a reused account hides first-run state. This epic's surface is the **signed-out** home
 * page, so there is no account to create and none to clean up.
 *
 * ## What it is looking for that a test cannot
 *
 * 1. **The cycle restarts after a click.** EPIC-016b's rotator stopped for good; this one restarts,
 *    which is Soroush's ruling of 2026-09-21. That is four seconds of watching a strip, and it is
 *    the kind of thing a green assertion can be written about without anybody ever having seen it.
 * 2. **The visibility gate does what it is for.** Scrolling away and back is a reader's motion, not
 *    a DOM query, and the defect it prevents — arriving at a rotator that advanced for nobody — is
 *    only visible to somebody scrolling.
 * 3. **Five illustrations, each of the product.** Screenshots exist to be *looked at*: whether a
 *    picture of a suite result reads as one is not something `toHaveCount(1)` can answer.
 * 4. **Reduced motion leaves each panel finished, not empty.** The mockup gets this wrong — its own
 *    rule renders the sweep at `width: 0` — so a build that copied it would look perfect with
 *    motion on and blank with it off.
 * 5. **The page does not jump as the rotator advances.** The panel's `min-height` was set against
 *    panels that had no illustration; this prints the five heights so the number is measured rather
 *    than asserted.
 *
 * ## It is watched, not headless
 *
 * It opens the built app in the IDE preview pane and drives it in a visible browser.
 * `DRIVE_HEADLESS=1` must keep working, because `gates.mjs ci` runs unattended and must never wait
 * on a window.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3131";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-016c");
mkdirSync(SHOTS, { recursive: true });

const TABS = ["Import", "Compose", "Test", "Publish", "Deliver"] as const;

const IDE = "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide";
let paneWarned = false;
const pane = (url: string): void => {
  try {
    execFile(
      IDE,
      ["--open-url", `antigravity-ide://local.drive-preview/open?url=${encodeURIComponent(url)}`],
      (error) => {
        if (error && !paneWarned) {
          paneWarned = true;
          console.log(`preview pane unavailable (${error.message.split("\n")[0]}) — the drive carries on`);
        }
      }
    );
  } catch (error) {
    if (!paneWarned) {
      paneWarned = true;
      console.log(`preview pane unavailable (${String(error)}) — the drive carries on`);
    }
  }
};

const results: { name: string; ok: boolean; detail: string }[] = [];
const transcript: string[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  const line = `${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`;
  transcript.push(line);
  console.log(line);
};

/** The consent banner mounts from an effect, so a screenshot that does not pre-answer it is a
 *  screenshot of whichever frame won the race. `landing.spec.ts` does the same thing. */
async function dismissConsent(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: "41prompts_analytics_consent", value: "denied", domain: "localhost", path: "/" }
  ]);
}

/** One surface, clipped to itself, so a screenshot of "the rotator" is of the rotator. */
async function shoot(target: Page, file: string, selector: string): Promise<void> {
  const element = target.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  const path = join(SHOTS, file);
  if (box === null) {
    await target.screenshot({ path });
    return;
  }
  await target.screenshot({
    path,
    clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 }
  });
}

/** The word on the tab that is currently selected. */
async function selectedTab(page: Page): Promise<string> {
  return (await page.locator('[role="tab"][aria-selected="true"]').innerText()).trim();
}

/** Put the rotator on screen and take the pointer off it — hovering pauses the cycle, and
 *  `scrollIntoViewIfNeeded` can leave the pointer sitting on a tab it just moved under. */
async function toRotator(page: Page): Promise<void> {
  await page.getByRole("tablist", { name: "What the platform does" }).scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
}

pane(BASE);

const browser = await chromium.launch({
  headless: process.env.DRIVE_HEADLESS === "1",
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 350
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await dismissConsent(page);

try {
  // ── 1. It advances on its own, unattended, through more than one tab ───────────────────────────

  await page.goto(BASE, { waitUntil: "networkidle" });
  pane(BASE);
  await toRotator(page);

  const walked: string[] = [await selectedTab(page)];
  // Two cycles and a margin. Sampling rather than waiting once, so the transcript carries the route
  // it took rather than only where it ended up.
  for (let tick = 0; tick < 12; tick += 1) {
    await page.waitForTimeout(1_000);
    const now = await selectedTab(page);
    if (now !== walked[walked.length - 1]) walked.push(now);
  }
  record(
    "the rotator advances on its own through at least two tabs, untouched",
    walked.length >= 3,
    walked.join(" → ")
  );

  // ── 2. Choosing a tab restarts the cycle; it does not end it ───────────────────────────────────

  await page.getByRole("tab", { name: "Publish" }).click();
  record(
    "clicking a tab selects it",
    (await selectedTab(page)) === "Publish",
    "Publish, chosen by hand"
  );

  // The click left focus on the tab, which pauses the cycle — that is the WCAG 2.2.2 mechanism and
  // it is deliberate. So the reader's own next move is what this measures.
  await page.waitForTimeout(6_500);
  record(
    "and it waits while the reader is still on it",
    (await selectedTab(page)) === "Publish",
    "six and a half seconds later, still Publish, because focus has not left the tab"
  );

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(5, 5);
  await page.waitForTimeout(6_500);
  const afterLeaving = await selectedTab(page);
  record(
    "the cycle comes back once the pointer and focus have left — the mockup's restart",
    afterLeaving !== "Publish",
    `Publish → ${afterLeaving}, with nothing touched after the blur`
  );

  // ── 3. The visibility gate ─────────────────────────────────────────────────────────────────────

  await toRotator(page);
  const parked = await selectedTab(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(7_000);
  await toRotator(page);
  record(
    "the timer does not run while the rotator is off screen",
    (await selectedTab(page)) === parked,
    `parked on ${parked}, scrolled away for seven seconds, came back to ${await selectedTab(page)}`
  );

  const fresh = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await dismissConsent(fresh);
  await fresh.goto(BASE, { waitUntil: "networkidle" });
  await fresh.waitForTimeout(11_000);
  record(
    "a reader who has not scrolled to it yet still finds it on Import",
    (await fresh.locator('[role="tab"][aria-selected="true"]').innerText()).trim() === "Import",
    "eleven seconds on the page without going near the rotator — more than two cycles"
  );
  await fresh.close();

  // ── 4. Five illustrations, and the page does not jump between them ─────────────────────────────

  const heights: string[] = [];
  for (const [index, name] of TABS.entries()) {
    await page.getByRole("tab", { name }).click();
    const panel = page.getByRole("tabpanel");
    const caption = (await panel.locator("figure.example figcaption").innerText()).replace(/\s+/g, " ");
    const shape = await panel.evaluate((element) => ({
      panel: Math.round(element.getBoundingClientRect().height),
      pieces: element.querySelectorAll(".rot-fig .pop").length,
      sideways: element.scrollWidth - element.clientWidth
    }));
    heights.push(`${name} ${shape.panel}px`);
    record(
      `the ${name} panel shows a picture of the product, marked as an example`,
      shape.pieces === 2 && /^example\b/i.test(caption) && shape.sideways <= 0,
      `${shape.pieces} elements · "${caption}" · ${shape.panel}px tall`
    );
    await shoot(page, `01-panel-${index + 1}-${name.toLowerCase()}.png`, ".rot");
  }
  const uniqueHeights = new Set(heights.map((row) => row.split(" ")[1]));
  record(
    "the page does not jump as the rotator advances",
    uniqueHeights.size === 1,
    `${heights.join(" · ")} — min-height 410px, measured against the tallest`
  );

  // ── 5. Reserved colour: inside a marked example, and nowhere else ──────────────────────────────

  await page.getByRole("tab", { name: "Test" }).click();
  const colour = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const reserved = new Set<string>();
    const styles = getComputedStyle(document.documentElement);
    for (const token of ["--color-pass", "--color-fail", "--color-warn"]) {
      for (const name of [token, `${token}-soft`]) {
        const declared = styles.getPropertyValue(name).trim();
        if (!declared) continue;
        probe.style.color = "";
        probe.style.color = declared;
        if (probe.style.color !== "") reserved.add(getComputedStyle(probe).color);
      }
    }
    probe.remove();
    const outside: string[] = [];
    let inside = 0;
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const computed = getComputedStyle(element);
      for (const property of ["color", "backgroundColor", "borderTopColor", "borderBottomColor"] as const) {
        if (!reserved.has(computed[property])) continue;
        if (element.closest("figure.example")) inside += 1;
        else outside.push(`${String(element.className)}:${property}`);
      }
    }
    return { inside, outside, tokens: reserved.size };
  });
  record(
    "pass and fail are painted inside the marked example, where they mean pass and fail",
    colour.tokens === 6 && colour.inside > 0,
    `${colour.inside} painted elements inside figure.example, from ${colour.tokens} reserved tokens read`
  );
  record(
    "and nowhere outside one — the narrowed guard, seen rather than asserted",
    colour.outside.length === 0,
    colour.outside.length === 0 ? "rule 10 holds on the rest of the page" : colour.outside.slice(0, 3).join(", ")
  );

  // ── 6. Both themes, and a phone ────────────────────────────────────────────────────────────────

  await page.getByRole("tab", { name: "Publish" }).click();
  await shoot(page, "02-rotator-1440-light.png", ".rot");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Publish" }).click();
  await shoot(page, "03-rotator-1440-dark.png", ".rot");
  await page.screenshot({ path: join(SHOTS, "04-home-1440-dark.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "05-home-1440-light.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  pane(BASE);
  const phone = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("the page does not scroll sideways at 390px", phone <= 1, `overflow ${phone}px`);

  const narrow: string[] = [];
  for (const name of TABS) {
    await page.getByRole("tab", { name }).click();
    const sideways = await page.getByRole("tabpanel").evaluate((el) => el.scrollWidth - el.clientWidth);
    if (sideways > 0) narrow.push(`${name} ${sideways}px`);
  }
  record(
    "and no panel grows a horizontal scrollbar of its own at 390px",
    narrow.length === 0,
    narrow.join(", ") || "five panels, none of them wider than the card"
  );
  await page.getByRole("tab", { name: "Publish" }).click();
  await shoot(page, "06-rotator-390.png", ".rot");

  // ── 7. Reduced motion: every panel finished and in place ───────────────────────────────────────

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "networkidle" });
  pane(BASE);

  const faded: string[] = [];
  for (const [index, name] of TABS.entries()) {
    await page.getByRole("tab", { name }).click();
    const state = await page.getByRole("tabpanel").evaluate((element) => {
      const pieces = [...element.querySelectorAll<HTMLElement>(".rot-fig .pop")];
      return {
        count: pieces.length,
        animations: pieces.reduce((total, piece) => total + piece.getAnimations().length, 0),
        offset: pieces.filter((piece) => getComputedStyle(piece).transform !== "none").length,
        faintest: Math.min(...pieces.map((piece) => Number(getComputedStyle(piece).opacity)))
      };
    });
    if (state.count !== 2 || state.animations !== 0 || state.offset !== 0 || state.faintest !== 1) {
      faded.push(`${name}: ${state.count} pieces, ${state.animations} animating, ${state.offset} offset, faintest ${state.faintest}`);
    }
    await shoot(page, `07-reduced-motion-${index + 1}-${name.toLowerCase()}.png`, ".rot");
  }
  record(
    "under reduced motion every panel is complete and in place, never absent",
    faded.length === 0,
    faded.join(" · ") || "five panels, nothing animating, nothing offset, nothing at opacity 0"
  );

  const sweep = await page.evaluate(() => {
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    const mark = tab?.querySelector(".rot-sweep");
    return Math.round(
      ((mark?.getBoundingClientRect().width ?? 0) / Math.max(1, tab?.getBoundingClientRect().width ?? 1)) * 100
    );
  });
  record(
    "and the sweep shows the END of its five seconds, not width zero",
    sweep >= 99,
    `${sweep}% of the tab — the mockup renders this at 0% and is wrong (docs/design/README.md)`
  );
  await page.screenshot({ path: join(SHOTS, "08-reduced-motion-full.png"), fullPage: true });
} finally {
  await browser.close();
}

const passed = results.filter((result) => result.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
