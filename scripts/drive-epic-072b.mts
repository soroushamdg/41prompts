/**
 * EPIC-072b's drive: `/about` and `/careers` on the BUILT app, reached the way a reader reaches
 * them — by clicking the footer.
 *
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3131)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/072b.env
 *   set -a && . /tmp/072b.env && set +a
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p
 *   export E2E_RATE_LIMIT_OFF=1
 *   pnpm --filter @41prompts/web start --port 3131 &
 *   npx tsx scripts/drive-epic-072b.mts
 *
 * ## It does not sign in, and that is a decision rather than an omission
 *
 * Nothing on either page depends on a session: they render identically to a visitor and to an
 * account holder, and the only part of the chrome that changes is the nav's right-hand pair, which
 * EPIC-016d's drive already covered in both states. A drive that creates an account it has no use
 * for is a drive that has to delete one. The `claude-drive-%@example.com` cleanup still runs at
 * both ends anyway — it is idempotent, deleting nothing is the normal outcome, and running it is
 * what makes a previous drive that died mid-flight self-healing rather than somebody else's
 * problem.
 *
 * ## What it is looking for that a test cannot
 *
 * 1. **Whether `/about` reads as deliberate rather than unfinished.** One person card on a page is
 *    the correct content and the risky layout: the question a screenshot answers and an assertion
 *    cannot is whether it looks like a decision or like a card failed to load.
 * 2. **Whether `/careers` reads as an answer rather than as an error.** A page whose entire
 *    content is "there is nothing here" has one failure mode — looking like a 404 that forgot to
 *    set its status — and no assertion about its text can see it.
 * 3. **The footer's fourth group at both widths.** EPIC-072's one screenshot-only defect was the
 *    fourth group wrapping, and this epic is the one that changes that group: `Elsewhere` had a
 *    single link and `Company` has three.
 * 4. **Both pages reached by clicking**, from the home page's footer, because a route that answers
 *    200 to `request.get` and is unreachable by a person is still a page nobody can find.
 * 5. **Dark theme on both**, which is where a hairline card with almost nothing in it is most
 *    likely to disappear.
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
import { deleteDriveUsers } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3131";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-072b");
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

/** One surface, clipped to itself, so a screenshot of "the footer" is of the footer. */
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
 * The theme, set the way `landing.spec.ts` sets it.
 *
 * Two waits, and `PROCESS.md`'s helper rule wants both justified. The first waits on the
 * **attribute**, which is the condition — a duration there would assert that some number of
 * milliseconds is enough on every machine forever. The second is a duration and cannot be anything
 * else: `base.css` transitions colour over 0.3s, so a screenshot taken immediately is of a blended
 * frame rather than of either theme. **What it could hide** is a theme that arrives late for a
 * reason other than that transition; nothing here asserts on timing, so a late theme would show up
 * in the picture as the wrong colours rather than as a pass.
 */
async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((next) => document.documentElement.setAttribute("data-theme", next), theme);
  await page.waitForFunction((next) => document.documentElement.getAttribute("data-theme") === next, theme);
  await page.waitForTimeout(350);
}

/**
 * How far a page scrolls sideways, and how tall the footer's link groups are.
 *
 * The wrap is read as **the number of distinct `top` values the four headings sit at**. A footer
 * laid out as one row of four has one; a wrapped one has two. That is the measurement EPIC-072's
 * defect would have failed, and it is a number rather than a look at a picture.
 */
async function footerShape(page: Page): Promise<{ groups: number; rows: number; headings: string[]; sideways: number }> {
  return page.evaluate(() => {
    const headings = [...document.querySelectorAll<HTMLElement>(".site-foot-grid h2")];
    const tops = new Set(headings.map((heading) => Math.round(heading.getBoundingClientRect().top)));
    return {
      groups: headings.length,
      rows: tops.size,
      headings: headings.map((heading) => heading.textContent ?? ""),
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

pane(BASE);

console.log(`cleanup before: ${await deleteDriveUsers()} drive user(s) removed`);

const browser = await chromium.launch({
  headless: process.env.DRIVE_HEADLESS === "1",
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 350
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
await dismissConsent(page);

try {
  // ── 1. The footer, which is the only way in ────────────────────────────────────────────────────

  await page.goto(BASE, { waitUntil: "networkidle" });
  pane(BASE);

  const laptopFooter = await footerShape(page);
  record(
    "the footer is four groups on one row, and the fourth is Company",
    laptopFooter.groups === 4 && laptopFooter.rows === 1 && laptopFooter.headings[3] === "Company",
    `${laptopFooter.groups} groups · ${laptopFooter.rows} row · ${laptopFooter.headings.join(" · ")}`
  );
  await shoot(page, "01-footer-1440.png", ".site-foot");

  const companyLinks = await page.locator(".site-foot-grid > div:last-child a").allInnerTexts();
  record(
    "Company carries About, Careers and Contact",
    companyLinks.join(" · ") === "About · Careers · Contact",
    companyLinks.join(" · ")
  );

  // ── 2. /about, reached by clicking ─────────────────────────────────────────────────────────────

  await page.locator('.site-foot a[href="/about"]').click();
  await page.waitForURL(/\/about$/);
  pane(page.url());
  record("clicking About in the footer arrives on /about", new URL(page.url()).pathname === "/about", page.url());

  const aboutHeading = (await page.locator("h1").innerText()).trim();
  record(
    "the heading is the mockup's, in the first person",
    aboutHeading === "I got tired of guessing which prompt was better.",
    aboutHeading
  );

  const aboutText = (await page.locator("main#main").innerText()).replace(/\s+/g, " ");
  record(
    "the origin paragraph dates it to 2026, not the mockup's 2025",
    aboutText.includes("in 2026") && !aboutText.includes("2025"),
    aboutText.slice(0, 120)
  );

  const people = await page.locator("[data-person]").allInnerTexts();
  record(
    "exactly one person, named as Founder",
    people.length === 1 && people[0]?.includes("Soroush Bonab") === true && people[0]?.includes("Founder") === true,
    `${people.length} · ${people.map((person) => person.replace(/\s+/g, " ")).join(" | ")}`
  );

  record(
    "and nothing on the page says co-founder or our team",
    !/\bco-founders?\b/i.test(aboutText) && !/\bour team\b/i.test(aboutText),
    "neither pattern found in the rendered text"
  );

  // **The "if I stop" section was removed on 2026-09-24**, Soroush ruling *same as the mockup* —
  // whose about page is an eyebrow, a headline, an origin paragraph and the people, and nothing
  // after. So the page now ends at the person card, and the check is that it does: a stray section
  // surviving the edit would show up here rather than in a screenshot nobody re-reads.
  const aboutSections = await page.locator("main#main section").count();
  record("the page ends at the person card, as the mockup's does", aboutSections === 0, `${aboutSections} section(s) after it`);

  await page.screenshot({ path: join(SHOTS, "02-about-1440.png"), fullPage: true });
  await shoot(page, "03-about-person-card.png", ".site-card");

  await setTheme(page, "dark");
  await page.screenshot({ path: join(SHOTS, "04-about-1440-dark.png"), fullPage: true });
  const darkCard = await page.locator(".site-card").first().evaluate((element) => {
    const computed = getComputedStyle(element);
    return { border: computed.borderTopColor, background: computed.backgroundColor };
  });
  record(
    "the one card is still a card in the dark theme, rather than disappearing into the page",
    darkCard.border !== darkCard.background && darkCard.border !== "rgba(0, 0, 0, 0)",
    `border ${darkCard.border} on ${darkCard.background}`
  );
  await setTheme(page, "light");

  // ── 3. /careers ────────────────────────────────────────────────────────────────────────────────

  await page.locator('.site-foot a[href="/careers"]').click();
  await page.waitForURL(/\/careers$/);
  pane(page.url());
  record("clicking Careers in the footer arrives on /careers", new URL(page.url()).pathname === "/careers", page.url());

  const careersHeading = (await page.locator("h1").innerText()).trim();
  record(
    "the heading is the answer, not a job board",
    careersHeading === "No roles are open right now.",
    careersHeading
  );

  const careersText = (await page.locator("main#main").innerText()).replace(/\s+/g, " ");
  record(
    "it uses none of the phrases the site-wide hiring guard refuses",
    !/\bopen (?:roles|positions)\b/i.test(careersText) && !/\bwe(?:'re| are) hiring\b/i.test(careersText),
    "neither phrase found in the rendered text"
  );

  record(
    "none of the mockup's three invented openings is on it",
    !/Founding engineer|Developer advocate|Design engineer/i.test(careersText),
    "none found"
  );

  const contactHref = page.locator('main#main a[href="/contact"]');
  record("and it offers a route to a person", (await contactHref.count()) === 1, `${await contactHref.count()} link`);

  // **The thing this drive found.** The route was offered by a link that rendered in the same
  // colour, the same weight and with no underline as the heading beside it — a contact route a
  // reader could only discover with a mouse. Measured here rather than looked at, because looking
  // is exactly what missed it on seven pages for two epics.
  const contactLook = await contactHref.evaluate((anchor) => {
    const own = getComputedStyle(anchor);
    const around = anchor.parentElement ? getComputedStyle(anchor.parentElement) : own;
    return { decoration: own.textDecorationLine, colour: own.color, around: around.color };
  });
  record(
    "and the route is visibly a link, not text of the same colour with no underline",
    contactLook.decoration.includes("underline"),
    `${contactLook.decoration} · ${contactLook.colour} on ${contactLook.around}`
  );

  await page.screenshot({ path: join(SHOTS, "05-careers-1440.png"), fullPage: true });

  // The click that proves the route goes somewhere real, not just that the href is spelled right.
  await contactHref.click();
  await page.waitForURL(/\/contact$/);
  pane(page.url());
  record(
    "which lands on the contact page that says there is no support address yet",
    (await page.locator("main").innerText()).includes("There is no support address yet"),
    new URL(page.url()).pathname
  );

  // ── 4. Both pages at 390px, which is where the footer defect lived ─────────────────────────────

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, file] of [
    ["/about", "06-about-390.png"],
    ["/careers", "07-careers-390.png"]
  ] as const) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    pane(`${BASE}${route}`);
    const shape = await footerShape(page);
    record(
      `${route} does not scroll sideways at 390px and its footer still has all four groups`,
      shape.sideways <= 0 && shape.groups === 4,
      `overflow ${shape.sideways}px · ${shape.groups} groups in ${shape.rows} rows`
    );
    await page.screenshot({ path: join(SHOTS, file), fullPage: true });
  }
  await shoot(page, "08-footer-390.png", ".site-foot");

  // ── 5. The two things a person still has to look at ────────────────────────────────────────────

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto(`${BASE}/careers`, { waitUntil: "networkidle" });
  const careersStatus = (await page.goto(`${BASE}/careers`))?.status();
  record("and /careers is a 200, not a 404 wearing a page", careersStatus === 200, String(careersStatus));

  const notThere = (await page.goto(`${BASE}/not-a-route-this-site-has`))?.status();
  record(
    "while a route nobody built is still a 404, so the line above means something",
    notThere === 404,
    String(notThere)
  );
} finally {
  await browser.close();
  console.log(`cleanup after: ${await deleteDriveUsers()} drive user(s) removed`);
}

const passed = results.filter((result) => result.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
