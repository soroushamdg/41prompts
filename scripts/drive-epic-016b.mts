/**
 * EPIC-016b's drive: the BUILT home page, with the mockup's sections on it.
 *
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3131)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/016b.env
 *   set -a && . /tmp/016b.env && set +a
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p
 *   pnpm --filter @41prompts/web start --port 3131 &
 *   npx tsx scripts/drive-epic-016b.mts
 *
 * ## It does not sign in, and that is not an omission
 *
 * `docs/AUTONOMOUS.md` asks every drive to sign in as a fresh `claude-drive-…@example.com` user,
 * because a reused account hides first-run state. This epic's whole surface is the **signed-out**
 * home page: the thing a stranger sees. So there is no account to create and none to clean up, and
 * the drive asserts the signed-out nav rather than pretending otherwise.
 *
 * ## What it is looking for that a test cannot
 *
 * Three things, and each of them has to be seen rather than asserted:
 *
 * 1. **The walk actually runs**, in a browser, on the built CSS — an animation is the one thing a
 *    server-rendered assertion is structurally blind to.
 * 2. **Reduced motion leaves a finished page, not an empty one.** The failure mode this epic is
 *    most exposed to is a section whose resting style is its *start* state, which looks perfect
 *    with motion on and blank with motion off. Every reduced-motion screenshot here exists to be
 *    looked at, not counted.
 * 3. **The rotator hands over.** It advances on a timer until somebody chooses a tab; a strip that
 *    kept going would take the panel away five seconds after they picked it.
 *
 * ## It is watched, not headless
 *
 * Soroush watches the drive happen, so it opens the built app in the IDE preview pane and drives it
 * in a visible browser. `DRIVE_HEADLESS=1` must keep working, because `gates.mjs ci` runs
 * unattended and must never wait on a window.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3131";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-016b");
mkdirSync(SHOTS, { recursive: true });

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

/** How many CSS animations are attached to the surfaces this epic animates. */
async function animationCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const selectors = [".shot [data-b]", ".run-demo tbody tr", ".run-demo .meter-fill", ".rot-sweep"];
    let total = 0;
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) total += element.getAnimations().length;
    }
    return total;
  });
}

pane(BASE);

const browser = await chromium.launch({
  headless: process.env.DRIVE_HEADLESS === "1",
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 350
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await dismissConsent(page);

try {
  // ── 1. The page a stranger sees ────────────────────────────────────────────────────────────────

  await page.goto(BASE, { waitUntil: "networkidle" });
  pane(BASE);

  const captions = await page.locator("figure.example figcaption").allInnerTexts();
  record(
    "four illustrative surfaces, each marked as an example and each saying what it is a picture of",
    // The marker renders through `text-transform: uppercase`, so `innerText` says EXAMPLE. The
    // accessible name is the DOM text either way; this reads what is on screen.
    captions.length === 4 && captions.every((caption) => /^example\b/i.test(caption)),
    captions.map((caption) => caption.replace(/\s+/g, " ")).join(" · ")
  );

  record(
    "the nav is the signed-out one, so this is what a stranger gets",
    (await page.getByTestId("nav-sign-in").count()) === 1,
    "Sign in present, no dashboard link"
  );

  // ── 2. The shot: the walk runs, hovering links a span to its blok, Replay restarts it ──────────

  const walkAnimations = await page
    .locator(".shot")
    .evaluate((shot) => [...shot.querySelectorAll("[data-b]")].reduce((n, el) => n + el.getAnimations().length, 0));
  record(
    "the span-to-blok walk is running, from CSS the server rendered already playing",
    walkAnimations === 9,
    `${walkAnimations} animations across four spans and five cards`
  );

  await page.hover('.shot .shot-blok[data-b="b3"]');
  // Written without a local helper on purpose: `tsx` compiles with esbuild's `keepNames`, which
  // injects a `__name` call for any function assigned to a variable — and that symbol does not
  // exist in the page, so an evaluate containing one dies with `__name is not defined`. Inline
  // callbacks are anonymous and are fine. `drive-epic-024.mts` sidesteps the same trap by passing
  // its evaluates as strings.
  const linked = await page.evaluate(() => ({
    hovered: getComputedStyle(document.querySelector('.shot .shot-span[data-b="b3"]') as Element).backgroundColor,
    other: getComputedStyle(document.querySelector('.shot .shot-span[data-b="b1"]') as Element).backgroundColor
  }));
  record(
    "hovering a blok lights the span it owns, and only that one",
    linked.hovered !== linked.other,
    `hovered ${linked.hovered} · its neighbour ${linked.other}`
  );
  await shoot(page, "01-shot-hover-link.png", ".shot");

  // Let the walk finish first, which is the state a reader is actually in when they reach for
  // `Replay`. **Not a comparison of two clock readings**: the last pair's animation ends about three
  // seconds in, and a drive with `slowMo` on arrives well after that, so "it went backwards" is a
  // race. What is asserted is the thing the control claims — after the click there is a walk, and it
  // is at its beginning.
  await page.waitForTimeout(3_200);
  // `locator.evaluate` given a **string** evaluates it as an expression and never calls it with the
  // element, which returns `undefined` rather than failing. An inline arrow is the form that works
  // here; what it must not contain is a function assigned to a variable (see above).
  const clock = async (): Promise<number> =>
    page.locator('.shot .shot-span[data-b="b4"]').evaluate((el) => {
      const running = el.getAnimations()[0];
      return running ? Math.round(Number(running.currentTime ?? 0)) : -1;
    });
  const beforeReplay = await clock();
  await page.getByRole("button", { name: "Replay" }).click();
  const afterReplay = await clock();
  record(
    "Replay puts the walk back to the beginning",
    afterReplay >= 0 && afterReplay < 500,
    `before: ${beforeReplay === -1 ? "no animation left to run" : `${beforeReplay}ms in`} · after the click: ${afterReplay}ms`
  );

  // ── 3. The rotator: it advances, then it hands over ────────────────────────────────────────────

  await page.getByRole("tab", { name: "Import" }).scrollIntoViewIfNeeded();
  // Off the rotator, and deliberately: hovering it pauses the cycle, and scrolling can leave the
  // pointer sitting on a tab without anything having been moved.
  await page.mouse.move(5, 5);
  const selectedTab = page.locator('[role="tab"][aria-selected="true"]');
  const before = (await selectedTab.innerText()).trim();
  await page.waitForTimeout(6_500);
  const after = (await selectedTab.innerText()).trim();
  record(
    "the rotator advances on its own",
    before !== after && after.length > 0,
    `${before} → ${after}, with nothing touched`
  );

  for (const [index, name] of ["Import", "Compose", "Test", "Publish", "Deliver"].entries()) {
    await page.getByRole("tab", { name }).click();
    const panel = (await page.getByRole("tabpanel").innerText()).replace(/\s+/g, " ").slice(0, 70);
    record(`the ${name} tab opens its panel`, panel.length > 40, panel);
    await shoot(page, `02-rotator-${index + 1}-${name.toLowerCase()}.png`, ".rot");
  }

  record(
    "the mockup's fifth tab is not shipped",
    (await page.getByRole("tab", { name: "Learn" }).count()) === 0,
    "Deliver, not Learn — there are no lessons"
  );

  await page.waitForTimeout(6_500);
  record(
    "and it stops once the reader has chosen",
    (await page.getByRole("tab", { name: "Deliver" }).getAttribute("aria-selected")) === "true",
    "still on Deliver six seconds after the click"
  );

  await page.getByRole("tab", { name: "Deliver" }).press("Home");
  record(
    "the keyboard drives it as a tablist",
    (await page.getByRole("tab", { name: "Import" }).getAttribute("aria-selected")) === "true",
    "Home from Deliver selects Import and takes focus with it"
  );

  // ── 4. An Ask-AI chip shows exactly what it will send ──────────────────────────────────────────

  await page.getByRole("button", { name: "Why compare models this way?" }).click();
  const sheetText = await page.getByLabel("This is exactly what will be sent.").inputValue();
  record(
    "an Ask-AI chip opens with the question it will send, editable",
    sheetText.startsWith("I run the same prompt on three different models"),
    `${sheetText.length} characters, shown before anything leaves the page`
  );
  await page.screenshot({ path: join(SHOTS, "03-ask-chip.png") });
  await page.getByRole("button", { name: "Close" }).click();

  // ── 5. The whole page, both themes ─────────────────────────────────────────────────────────────

  await page.screenshot({ path: join(SHOTS, "04-home-1440-light.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2_600);
  await page.screenshot({ path: join(SHOTS, "05-home-1440-dark.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  const reserved = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const values = ["--color-pass", "--color-fail", "--color-warn"]
      .flatMap((token) => [styles.getPropertyValue(token).trim(), styles.getPropertyValue(`${token}-soft`).trim()])
      .filter(Boolean);
    const bad: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const computed = getComputedStyle(element);
      for (const property of ["color", "backgroundColor", "borderTopColor"] as const) {
        if (values.some((value) => computed[property] === value)) bad.push(String(element.className));
      }
    }
    return bad;
  });
  record(
    "no pass, fail or drift colour anywhere on the page",
    reserved.length === 0,
    reserved.length === 0 ? "rule 10 holds; the meters are ink" : reserved.slice(0, 3).join(", ")
  );

  // ── 6. A phone ─────────────────────────────────────────────────────────────────────────────────

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  pane(BASE);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  record("the page does not scroll sideways at 390px", overflow <= 1, `overflow ${overflow}px`);

  const short: string[] = [];
  for (const [name, locator] of [
    ["Replay", page.getByRole("button", { name: "Replay" })],
    ["the Import tab", page.getByRole("tab", { name: "Import" })],
    ["the Deliver tab", page.getByRole("tab", { name: "Deliver" })],
    ["an Ask-AI chip", page.getByRole("button", { name: "Why does it matter which line failed?" })]
  ] as const) {
    const box = await locator.boundingBox();
    if (box === null || box.height < 44) short.push(`${name} ${Math.round(box?.height ?? 0)}px`);
  }
  record("every new control clears 44px on a phone", short.length === 0, short.join(", ") || "four controls, all ≥ 44px");
  await page.screenshot({ path: join(SHOTS, "06-home-390.png"), fullPage: true });

  // ── 7. Reduced motion: the end of every animation, not a blank page ────────────────────────────

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "networkidle" });
  pane(BASE);

  record(
    "under reduced motion nothing on the four surfaces is animating",
    (await animationCount(page)) === 0,
    "the shot's walk, the rows, the meters and the sweep are all off"
  );

  const endState = await page.evaluate(() => {
    const table = document.querySelector(".run-demo");
    const track = table?.querySelector(".meter-track")?.getBoundingClientRect().width ?? 1;
    const fill = table?.querySelector(".meter-fill")?.getBoundingClientRect().width ?? 0;
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    const sweep = tab?.querySelector(".rot-sweep")?.getBoundingClientRect().width ?? 0;
    return {
      offsetRows: [...(table?.querySelectorAll("tbody tr") ?? [])].filter(
        (row) => getComputedStyle(row).transform !== "none"
      ).length,
      meter: Math.round((fill / Math.max(1, track)) * 100),
      sweep: Math.round((sweep / Math.max(1, tab?.getBoundingClientRect().width ?? 1)) * 100),
      panel: (document.querySelector('[role="tabpanel"]:not([hidden])')?.textContent ?? "").slice(0, 40)
    };
  });
  record(
    "and every one of them is at its END state, not its start",
    endState.offsetRows === 0 && endState.meter >= 95 && endState.sweep >= 99 && endState.panel.length > 10,
    `rows landed · first meter ${endState.meter}% of its track · sweep ${endState.sweep}% · panel "${endState.panel.trim()}"`
  );
  record(
    "Replay is gone, because it would replay nothing",
    (await page.getByRole("button", { name: "Replay" }).count()) === 0,
    "no dead control, in the accessibility tree or on screen"
  );

  await page.screenshot({ path: join(SHOTS, "07-reduced-motion-full.png"), fullPage: true });
  for (const [name, selector] of [
    ["shot", ".shot"],
    ["run-demo", ".run-demo"],
    ["rotator", ".rot"]
  ] as const) {
    await shoot(page, `08-reduced-motion-${name}.png`, selector);
  }
} finally {
  await browser.close();
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

const passed = results.filter((result) => result.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
