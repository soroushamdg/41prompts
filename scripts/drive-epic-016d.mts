/**
 * EPIC-016d's drive: the landing page's remaining mockup parity, on the BUILT app.
 *
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3131)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/016d.env
 *   set -a && . /tmp/016d.env && set +a
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p
 *   export E2E_RATE_LIMIT_OFF=1
 *   pnpm --filter @41prompts/web start --port 3131 &
 *   npx tsx scripts/drive-epic-016d.mts
 *
 * ## It signs in, and this is the first landing-page drive that does
 *
 * EPIC-016b's and EPIC-016c's surfaces were the signed-out home page, so neither created an
 * account. This epic's nav is **different when a session exists** — `Start free` is offered to a
 * visitor and withheld from somebody who already has one — and that is an acceptance criterion no
 * signed-out drive can reach. So it mints a magic-link token out of the local database for a fresh
 * `claude-drive-…@example.com` user, the mechanism `apps/web/e2e/db.ts` already uses, and deletes
 * the row at both ends.
 *
 * ## What it is looking for that a test cannot
 *
 * 1. **Whether the persistent kind colour reads as one system.** Six hues on a rail and a tag, at
 *    rest, across three surfaces — the shot, the rotator, and the real decompiler. A stylesheet
 *    assertion says a rule exists; only a picture says the six of them look like a palette and not
 *    like six unrelated decisions.
 * 2. **Whether the hero is now too long.** It gained an eyebrow, a second CTA, an Ask-AI bar and
 *    four chips. The above-the-fold assertion covers the paste box and says nothing about whether
 *    what follows it reads as a hero or as a pile.
 * 3. **The nav at phone width**, which is where this epic's one e2e failure was and where the fix
 *    was measured rather than reasoned about.
 * 4. **The Ask-AI bar handing a real question to a real destination** — the sheet says "this is
 *    exactly what will be sent", and the only way to know is to read the URL it would open.
 * 5. **The decompiler reached from the hero's own paste box**, which is the page's actual job and
 *    the one journey no assertion on this page takes end to end.
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
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3131";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-016d");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-016d-${Date.now()}@example.com`;

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

/** One surface, clipped to itself, so a screenshot of "the nav" is of the nav. */
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

/**
 * Every element painting a kind colour, and what it painted.
 *
 * Read from the page rather than from the stylesheet: the unit test proves a rule exists, and this
 * proves the rule reaches an element and resolves to a colour. A rail whose variable resolves to
 * nothing is `background: ` — invisible, and a stylesheet assertion cannot tell.
 */
async function kindColours(page: Page): Promise<{ kind: string; rail: string; tag: string }[]> {
  return page.evaluate(() => {
    const seen = new Map<string, { kind: string; rail: string; tag: string }>();
    for (const element of document.querySelectorAll<HTMLElement>("[data-kind]")) {
      const kind = element.getAttribute("data-kind") ?? "";
      if (seen.has(kind)) continue;
      const rail = getComputedStyle(element, "::before").backgroundColor;
      const tag = element.querySelector(".tag");
      if (rail === "" || rail === "rgba(0, 0, 0, 0)") continue;
      seen.set(kind, { kind, rail, tag: tag === null ? "—" : getComputedStyle(tag).color });
    }
    return [...seen.values()];
  });
}

/** Every reserved hue painted outside a marked example. `apps/web/e2e/reserved-colour.ts`'s probe,
 *  inline because a drive script cannot import a spec helper across the package boundary. */
async function reservedOutsideExamples(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.display = "none";
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
    if (reserved.size === 0) return ["reserved colour tokens could not be read from :root"];
    const bad: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      if (element.closest("figure.example")) continue;
      const computed = getComputedStyle(element) as unknown as Record<string, string>;
      for (const property of ["color", "backgroundColor", "borderTopColor", "borderLeftColor"]) {
        const used = computed[property];
        if (used && reserved.has(used)) bad.push(`${String(element.className)}:${property}`);
      }
    }
    return bad;
  });
}

pane(BASE);

// Idempotent, and deleting nothing is the normal outcome. Running it first is what makes a drive
// whose browser died self-healing rather than something the next run has to notice.
console.log(`cleanup before: ${await deleteDriveUsers()} drive user(s) removed`);

const browser = await chromium.launch({
  headless: process.env.DRIVE_HEADLESS === "1",
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 350
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await dismissConsent(page);

try {
  // ── 1. The nav, in the mockup's shape ──────────────────────────────────────────────────────────

  await page.goto(BASE, { waitUntil: "networkidle" });
  pane(BASE);

  const navWords = await page.locator(".site-nav a.site-nav-link").allInnerTexts();
  record(
    "the nav opens with Product and runs in the mockup's order",
    navWords.join(" · ") === "Product · Features · Delivery · Docs · Decompiler",
    navWords.join(" · ")
  );

  const current = await page.locator('.site-nav a[aria-current="page"]').innerText();
  record("and Product is marked as the current page on the home page", current.trim() === "Product", current.trim());

  const controls = await page.locator(".site-nav .btn").allInnerTexts();
  record(
    "Sign in and Start free are bordered buttons, and Start free is the primary",
    controls.join(" · ") === "Theme · Sign in · Start free" &&
      (await page.locator(".site-nav .btn-pri").innerText()).trim() === "Start free",
    controls.join(" · ")
  );
  await shoot(page, "01-nav-1440-signed-out.png", ".site-nav");

  // ── 2. The hero ────────────────────────────────────────────────────────────────────────────────

  // **`innerText` is the *rendered* text, and `.eyebrow` is `text-transform: uppercase`.** So the
  // eyebrow arrives as "THE WORKBENCH FOR THE PROMPT LAYER" and a case-sensitive `includes` fails
  // on a page that is correct. Found by running this drive, which is the second time a drive has
  // caught exactly this shape — EPIC-032a's `REQUEST` against a variable named `request`, where the
  // transform was the defect. Here it is not: the mockup draws this eyebrow uppercase and so does
  // every other one on the site. The source string is what is asserted, case-insensitively.
  const hero = (await page.locator(".hero").innerText()).toLowerCase();
  const heroHas = (text: string) => hero.includes(text.toLowerCase());
  const heroParts: [string, string][] = [
    ["eyebrow", "The workbench for the prompt layer"],
    ["headline", "Stop guessing which prompt works."],
    ["lede", "Break any prompt into bloks"]
  ];
  const heroMissing = heroParts.filter(([, text]) => !heroHas(text));
  record(
    "the hero carries the mockup's eyebrow, headline and lede",
    heroMissing.length === 0,
    heroMissing.length === 0
      ? heroParts.map(([name]) => name).join(" · ") + ", all the mockup's"
      : `missing: ${heroMissing.map(([name, text]) => `${name} ("${text}")`).join(", ")}`
  );

  const extras: [string, boolean][] = [
    ["the paste box", (await page.locator(".askbar").count()) === 1],
    ["the No credit card pill", heroHas("No credit card")],
    ["See the workbench", heroHas("See the workbench")]
  ];
  record(
    "with the paste box, the No credit card pill and the second call to action",
    extras.every(([, ok]) => ok),
    extras.map(([name, ok]) => `${ok ? "" : "NO "}${name}`).join(" · ")
  );

  const fold = await page.evaluate(() => {
    const bar = document.querySelector(".askbar");
    if (bar === null) return { bottom: -1, viewport: window.innerHeight };
    return { bottom: Math.round(bar.getBoundingClientRect().bottom), viewport: window.innerHeight };
  });
  record(
    "and the paste box is still whole above the fold after everything the hero gained",
    fold.bottom > 0 && fold.bottom <= fold.viewport,
    `ask bar ends at ${fold.bottom}px of ${fold.viewport}px`
  );
  await shoot(page, "02-hero-1440.png", ".hero");

  // The pill's dot is the one thing that could not be ported: the mockup paints it `--pass`.
  const dot = await page.locator(".askbar-pill .pill-dot").evaluate((el) => getComputedStyle(el).backgroundColor);
  record("the pill's dot is ink, not the pass hue the mockup paints it", dot !== "", `pill-dot is ${dot}`);

  // ── 3. The Ask-AI bar, and where a question actually goes ──────────────────────────────────────

  const field = page.getByLabel("Ask anything about 41Prompts");
  const first = await field.getAttribute("placeholder");
  await page.waitForTimeout(4_200);
  const second = await field.getAttribute("placeholder");
  record(
    "the placeholder rotates on its own, as the mockup's does",
    first !== second && first !== null && second !== null,
    `"${first}" → "${second}"`
  );

  await field.focus();
  const afterFocus = await field.getAttribute("placeholder");
  await page.waitForTimeout(4_200);
  record(
    "and stops for good the moment somebody means to type in it (WCAG 2.2.2)",
    afterFocus === first && (await field.getAttribute("placeholder")) === first,
    `settled back on "${afterFocus}" and stayed there`
  );

  await field.fill("What does 41Prompts do that a feature flag cannot?");
  await field.press("Enter");
  const sent = await page.getByLabel("This is exactly what will be sent.").inputValue();
  record(
    "Enter opens the sheet showing exactly the question that will be sent",
    sent === "What does 41Prompts do that a feature flag cannot?",
    sent
  );
  await shoot(page, "03-ask-sheet.png", '[role="dialog"]');

  // The whole promise of the sheet is the URL. Read it rather than trusting the label.
  const destination = await page.evaluate(() => {
    const button = [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === "Claude");
    if (!button) return null;
    let opened: string | null = null;
    const original = window.open;
    (window as unknown as { open: typeof window.open }).open = ((url: string) => {
      opened = url;
      return null;
    }) as typeof window.open;
    button.click();
    (window as unknown as { open: typeof window.open }).open = original;
    return opened;
  });
  record(
    "and the destination carries that question, encoded, and nothing of ours",
    destination !== null &&
      new URL(destination).searchParams.get("q") === "What does 41Prompts do that a feature flag cannot?" &&
      [...new URL(destination).searchParams.keys()].join(",") === "q",
    destination ?? "no URL was opened"
  );
  await page.keyboard.press("Escape");

  // ── 4. The product shot's pane bar ─────────────────────────────────────────────────────────────

  const shot = await page.locator(".shot").innerText();
  record(
    "the shot's pane bar carries the read-only pill, the token count and the two derived counts",
    shot.includes("read-only") && shot.includes("1,284 tok") && /\d+ bloks/.test(shot) && /Run \d+ checks/.test(shot),
    (shot.match(/read-only|1,284 tok|\d+ bloks|Run \d+ checks/g) ?? []).join(" · ")
  );

  const runControl = await page.locator(".shot-run").evaluate((el) => el.tagName.toLowerCase());
  record(
    "and its run control is a picture of a control, not a button nobody can press",
    runControl === "span",
    `<${runControl}> — nothing for a keyboard to reach and fail to use`
  );
  await shoot(page, "04-shot-1440.png", ".shot");

  // ── 5. Persistent kind colour, on three surfaces ───────────────────────────────────────────────

  const shotKinds = await kindColours(page);
  record(
    "every card in the shot paints its kind rail at rest, with no hover and no focus",
    shotKinds.length >= 4 && shotKinds.every((entry) => entry.rail !== "rgba(0, 0, 0, 0)"),
    shotKinds.map((entry) => `${entry.kind} ${entry.rail}`).join(" · ")
  );
  record(
    "and the kind tag is painted the same colour as the rail beside it",
    shotKinds.every((entry) => entry.tag === entry.rail),
    shotKinds.map((entry) => `${entry.kind}: rail ${entry.rail} / tag ${entry.tag}`).join(" · ")
  );

  const outside = await reservedOutsideExamples(page);
  record(
    "and no reserved hue is painted anywhere outside a marked example",
    outside.length === 0,
    outside.length === 0 ? "rule 10 holds — the palette is nowhere near pass, fail or drift" : outside.slice(0, 3).join(", ")
  );

  // ── 6. The three steps, the closing band and the footer ────────────────────────────────────────

  const steps = await page.locator(".strip-step h2").allInnerTexts();
  record(
    "the three steps read Decompile · Assert · Ship",
    steps.join(" · ") === "Decompile · Assert · Ship",
    steps.join(" · ")
  );
  const band = await page.locator(".cta-band").innerText();
  record(
    "the closing band is the mockup's",
    band.includes("Paste a prompt. See what is wrong with it.") && band.includes("Free, no signup, no card."),
    band.replace(/\s+/g, " ").trim().slice(0, 80)
  );
  const blurb = await page.locator(".site-foot-blurb").innerText();
  record("and the footer blurb is too", blurb.includes("The workbench for the prompt layer"), blurb);

  await page.screenshot({ path: join(SHOTS, "05-home-1440-light.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload({ waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "06-home-1440-dark.png"), fullPage: true });
  await shoot(page, "07-shot-1440-dark.png", ".shot");
  await page.emulateMedia({ colorScheme: "light" });

  // ── 7. The nav at phone width, which is where this epic's one e2e failure was ──────────────────

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload({ waitUntil: "networkidle" });
  pane(BASE);

  const phone = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>(".site-nav-inner > *")]
      .map((el) => ({ cls: el.className, box: el.getBoundingClientRect() }))
      .filter((entry) => entry.box.width > 0 && entry.box.height > 0);
    return {
      rows: new Set(items.map((entry) => Math.round(entry.box.top))).size,
      shortest: Math.min(...items.map((entry) => Math.round(entry.box.height))),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      words: items.map((entry) => `${entry.cls.split(" ").pop()}:${Math.round(entry.box.width)}`)
    };
  });
  record(
    "at 375px the nav is one row, every control clears 44px, and the page does not scroll sideways",
    phone.rows === 1 && phone.shortest >= 44 && phone.sideways <= 1,
    `${phone.rows} row · shortest ${phone.shortest}px · overflow ${phone.sideways}px · ${phone.words.join(" ")}`
  );
  await shoot(page, "08-nav-375.png", ".site-nav");
  await page.screenshot({ path: join(SHOTS, "09-home-375.png"), fullPage: true });

  // ── 8. The hero's own action, end to end, and the decompiler's kinded cards ────────────────────

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByLabel("Your prompt").fill(
    [
      "You are a support assistant for a subscription company.",
      "Always respond in JSON only. Never include prose outside the JSON.",
      "Keep the reason field under 20 words.",
      "Always be friendly and professional."
    ].join("\n")
  );
  await page.getByRole("button", { name: "See what nothing checks" }).click();
  await page.waitForURL(/\/decompile/);
  await page.getByTestId("source-map").waitFor({ state: "visible", timeout: 30_000 });
  pane(page.url());
  record(
    "the hero's paste box still lands on the decompiler with the prompt broken up",
    (await page.locator(".blok-card").count()) > 0,
    `${await page.locator(".blok-card").count()} blok cards from the hero's own box`
  );

  const decompileKinds = await kindColours(page);
  record(
    "and the decompiler's real cards carry the same persistent rail, on a page this epic never edited",
    decompileKinds.length > 0 && decompileKinds.every((entry) => entry.rail !== "rgba(0, 0, 0, 0)"),
    decompileKinds.map((entry) => `${entry.kind} ${entry.rail}`).join(" · ")
  );
  await shoot(page, "10-decompile-kind-rails.png", ".blok-card");
  await page.screenshot({ path: join(SHOTS, "11-decompile-1440.png"), fullPage: true });

  // ── 9. The nav when a session exists ───────────────────────────────────────────────────────────

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.waitForTimeout(1_500);
  const token = await magicLinkTokenFor(EMAIL);
  if (token === undefined) throw new Error(`no magic-link token was written for ${EMAIL}`);
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/`, { waitUntil: "networkidle" });
  await page.goto(BASE, { waitUntil: "networkidle" });
  pane(BASE);

  const signedInControls = await page.locator(".site-nav .btn").allInnerTexts();
  record(
    "a reader who already has an account is offered the dashboard, not a second account",
    signedInControls.join(" · ") === "Theme · Go to dashboard" &&
      (await page.locator(".site-nav .btn-pri").count()) === 0,
    signedInControls.join(" · ")
  );
  await shoot(page, "12-nav-1440-signed-in.png", ".site-nav");
} finally {
  await browser.close();
  console.log(`cleanup after: ${await deleteDriveUsers()} drive user(s) removed`);
}

const passed = results.filter((result) => result.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
