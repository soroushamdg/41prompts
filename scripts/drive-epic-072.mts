/**
 * EPIC-072's drive: the BUILT app on localhost, and the six pages this epic adds.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   pnpm exec turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3118)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/72.env
 *   set -a && . /tmp/72.env && set +a
 *   pnpm --filter @41prompts/web start --port 3118 &
 *   npx tsx scripts/drive-epic-072.mts
 *
 * ## What this drive is for, and why the e2e suite does not replace it
 *
 * `apps/web/e2e/site-pages.spec.ts` already walks every public route for a 200, one `<h1>`, no axe
 * violations and no sideways scroll. What it cannot do is **read the page as a person who is being
 * asked to believe it**, which is the whole of this epic's Review line. So this drive asks the
 * questions a suite has no way to ask:
 *
 * 1. **Does a reader arriving on a phone have any way to reach these pages?** The nav collapses its
 *    section links below 900px. That was the right fix for a 185px overflow, and it is also exactly
 *    the shape of the `/app` dead end EPIC-021a shipped — a page that renders perfectly and that
 *    nobody can leave. So the drive navigates **by clicking**, at 390px, through the footer.
 * 2. **Is what the page claims still what the registry says?** The unit test compares rendered text
 *    with `claims.ts` in a `renderToStaticMarkup`. This compares it in the built app, where a
 *    failed data import renders an empty string rather than throwing.
 * 3. **Does the Ask-AI chip send exactly what it showed?** The one interactive thing here, and the
 *    one property worth having: the query string is the textarea's value and nothing else.
 * 4. **Does the notices page show real packages** rather than an empty list from a JSON import that
 *    resolved to `{}`?
 * 5. **Dark mode**, where a mis-resolved token makes text invisible to every assertion about
 *    content.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik and migrations against the real database.
 * Nothing is pushed (`CLAUDE.md`), so nothing deploys and no staging URL is evidence about any of
 * this. Lighthouse is a separate instrument and is run by hand: `scripts/lighthouse-site.mjs`.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and the account is cleaned up at both ends.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";
import { CLAIMS } from "../apps/web/lib/site/claims";
import { NOTICE_PACKAGES } from "../apps/web/lib/site/third-party-notices";
import { ALL_FOOTER_LINKS, NAV_SECTION_LINKS } from "../apps/web/lib/site/links";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3118";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-072");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-072-${Date.now()}@example.com`;

const NEW_PAGES = [
  { route: "/features", heading: "Everything in the prompt layer, in one place." },
  { route: "/delivery", heading: "Change a prompt. Your application has it in a minute." },
  { route: "/docs", heading: "Reference" },
  { route: "/security", heading: "Your prompts, your keys, your traffic." },
  { route: "/changelog", heading: "What shipped" },
  { route: "/guides", heading: "How to do the common things" },
  { route: "/legal/third-party-notices", heading: "Third-party notices" }
];

const results: { name: string; ok: boolean; detail: string }[] = [];
const transcript: string[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  const line = `${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`;
  transcript.push(line);
  console.log(line);
};

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/sign-in?next=%2Fapp%2Fprojects`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 15_000 });
  const token = await magicLinkTokenFor(EMAIL);
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/app/projects`);
  await page.waitForURL(/\/app\/projects/, { timeout: 20_000 });
}

console.log(`cleaned up ${await deleteDriveUsers()} leftover drive account(s) before starting`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/**
 * Dismiss the analytics banner before anything is screenshotted.
 *
 * **Not a normalisation of the thing under test** (`docs/PROCESS.md`'s helper rule): the banner is
 * EPIC-017's, it is covered by `legal.spec.ts`, and nothing here asserts anything about it. What it
 * does is sit `position: fixed` over the middle of a `fullPage` capture, hiding a band of every
 * screenshot this drive exists to produce. Declining is what a reader would do, and it is the state
 * the rest of the drive should be read in.
 */
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const decline = page.getByRole("button", { name: "Decline" });
if (await decline.count()) {
  await decline.click();
  await decline.waitFor({ state: "detached", timeout: 10_000 });
}

try {
  // ── 0. Prove the server is the build just made (lesson 17) ─────────────────────────────────────
  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const buildId = readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  const firstHtml = await page.content();
  record(
    "the server answering is the build just made",
    landing?.status() === 200 && firstHtml.includes(buildId),
    `BUILD_ID ${buildId} ${firstHtml.includes(buildId) ? "is" : "is NOT"} in the HTML`
  );

  // ── 1. Each page renders, styled, with the heading it was written to have ───────────────────────
  //
  // **Styled, not merely present.** Twenty epics passed every gate while the deployed `/app`
  // rendered as unstyled text; the cheap probe for that is a computed value that only exists if the
  // stylesheet loaded. `--color-ink` is a token `packages/ui` defines, so reading it back non-empty
  // says the CSS arrived — EPIC-050's drive read `--ink`, which does not exist, and reported a
  // styled page as unstyled (lesson 13).
  for (const { route, heading } of NEW_PAGES) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const h1 = ((await page.locator("h1").first().textContent()) ?? "").trim();
    const styled = await page.evaluate(() => ({
      ink: getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim(),
      navBorder: getComputedStyle(document.querySelector("nav.site-nav")!).borderBottomWidth
    }));
    record(
      `${route} renders styled with its heading`,
      response?.status() === 200 && h1 === heading && styled.ink !== "" && styled.navBorder !== "0px",
      `HTTP ${response?.status()} · h1 ${JSON.stringify(h1)} · --color-ink ${styled.ink || "(EMPTY — stylesheet did not load)"}`
    );
  }

  // ── 2. Every sentence on the page is a registry claim, read out of the built app ────────────────
  //
  // The unit test asserts this over `renderToStaticMarkup`. This asserts it over what the server
  // actually returned, which is the thing a reader sees and the thing a broken data import breaks.
  await page.goto(`${BASE}/features`, { waitUntil: "networkidle" });
  const featuresText = await page.locator("main").innerText();
  const featureClaims = [
    "blok-canvas",
    "per-blok-compilation",
    "decompiler",
    "three-providers",
    "eight-check-kinds",
    "semantic-diff"
  ];
  const missing = featureClaims.filter((id) => !featuresText.includes(CLAIMS[id]!.text));
  record(
    "/features shows the registry's own sentences, not a paraphrase",
    missing.length === 0,
    missing.length === 0 ? `${featureClaims.length} claims found verbatim` : `missing: ${missing.join(", ")}`
  );

  // ── 3. Nothing on any new page claims something that is not built ──────────────────────────────
  const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
    ["SOC 2", /\bSOC\s*2\b/i],
    ["a lesson", /\blessons?\b/i],
    ["a price", /\$\d/],
    ["SSO or SAML", /\bSSO\b|\bSAML\b/i],
    ["an audit trail", /\baudit (?:trail|log)\b/i],
    ["a customer count", /\btrusted by\b|\b\d[\d,.]*\s*(?:companies|teams|engineers|customers)\b/i]
  ];
  const offences: string[] = [];
  for (const { route } of NEW_PAGES) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // **The notices page's package list is excluded, and the reason is a finding.** The first run of
    // this drive failed here on `@aws-sdk/credential-provider-sso`, a real transitive dependency,
    // read as a claim that this product does single sign-on. The page was right and the assertion
    // was wrong — `docs/PROCESS.md` lesson 21. The page's own prose stays under every pattern; only
    // the 423 generated identifiers come out.
    const text = await page.evaluate(() => {
      const main = document.querySelector("main")!.cloneNode(true) as HTMLElement;
      main.querySelectorAll(".legal-list").forEach((list) => list.remove());
      return main.innerText;
    });
    for (const [label, pattern] of FORBIDDEN) if (pattern.test(text)) offences.push(`${route}: ${label}`);
  }
  record(
    "no new page claims a certification, a lesson, a price, SSO or a customer count",
    offences.length === 0,
    offences.length === 0 ? `${NEW_PAGES.length} pages clean against ${FORBIDDEN.length} patterns` : offences.join("; ")
  );

  // ── 4. The notices page shows real packages, not an empty import ───────────────────────────────
  await page.goto(`${BASE}/legal/third-party-notices`, { waitUntil: "networkidle" });
  const noticeRows = await page.locator(".legal-list li").count();
  const sample = NOTICE_PACKAGES[0]!;
  const noticeText = await page.locator("main").innerText();
  record(
    "the notices page lists the real dependency closure",
    noticeRows === NOTICE_PACKAGES.length && noticeText.includes(`${sample.name}@${sample.version}`),
    `${noticeRows} rows rendered against ${NOTICE_PACKAGES.length} generated; first is ${sample.name}@${sample.version}`
  );
  await page.screenshot({ path: join(SHOTS, "07-third-party-notices-1440.png"), fullPage: false });

  // ── 5. The Ask-AI chip sends exactly what it showed ─────────────────────────────────────────────
  await page.goto(`${BASE}/delivery`, { waitUntil: "networkidle" });
  await page.locator(".ask-chip").first().click();
  const shown = await page.locator("#ask-sheet-text").inputValue();
  await page.screenshot({ path: join(SHOTS, "08-ask-chip-sheet-1440.png"), fullPage: false });
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("button", { name: "Claude" }).click()
  ]);
  const sent = new URL(popup.url());
  await popup.close();
  record(
    "the Ask-AI chip sends the exact text it showed, to somebody else's site",
    sent.hostname === "claude.ai" && sent.searchParams.get("q") === shown && shown.length > 40,
    `host ${sent.hostname} · query is ${sent.searchParams.get("q") === shown ? "identical to" : "DIFFERENT from"} the textarea (${shown.length} chars)`
  );
  await page.keyboard.press("Escape");

  // ── 6. A phone reader can actually reach these pages ───────────────────────────────────────────
  //
  // The nav's section links collapse below 900px. If the footer did not carry them, this epic would
  // have shipped six pages a phone reader cannot find — the `/app` dead end again, one floor up.
  // So this **clicks**, rather than asserting an href exists.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const navVisible = await page.locator(".site-nav .site-nav-links a").first().isVisible().catch(() => false);
  record(
    "at 390px the nav's section links are collapsed, as the mockup specifies",
    !navVisible,
    `section links ${navVisible ? "are visible" : "are hidden"} at 390px`
  );

  const reached: string[] = [];
  for (const link of NAV_SECTION_LINKS) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const footLink = page.locator(`.site-foot a[href="${link.href}"]`);
    await footLink.scrollIntoViewIfNeeded();
    await footLink.click();
    await page.waitForURL(`**${link.href}`, { timeout: 10_000 });
    if (page.url().endsWith(link.href)) reached.push(link.name);
  }
  record(
    "every collapsed page is reachable from the footer by clicking, on a phone",
    reached.length === NAV_SECTION_LINKS.length,
    `reached ${reached.join(", ")} from the footer at 390px`
  );

  await page.goto(`${BASE}/delivery`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  record("no horizontal page scroll at 390px", overflow <= 0, `scrollWidth − clientWidth = ${overflow}px`);
  await page.screenshot({ path: join(SHOTS, "05-delivery-390.png"), fullPage: true });

  // ── 7. Every footer link answers, from the built app ───────────────────────────────────────────
  await page.setViewportSize({ width: 1440, height: 900 });
  const broken: string[] = [];
  for (const link of ALL_FOOTER_LINKS) {
    const response = await page.goto(`${BASE}${link.href}`, { waitUntil: "domcontentloaded" });
    if (response?.status() !== 200) broken.push(`${link.href} → ${response?.status()}`);
  }
  record(
    "every footer link answers 200 on the built app",
    broken.length === 0,
    broken.length === 0 ? `${ALL_FOOTER_LINKS.length} links, all 200` : broken.join("; ")
  );

  // ── 8. Dark mode ───────────────────────────────────────────────────────────────────────────────
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/delivery`, { waitUntil: "networkidle" });
  const dark = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".site-grid-item p")!;
    const style = getComputedStyle(el);
    return { colour: style.color, bg: getComputedStyle(document.body).backgroundColor, height: el.offsetHeight };
  });
  record(
    "the new pages are painted in dark mode",
    dark.height > 0 && !dark.colour.includes("rgba(0, 0, 0, 0)") && dark.bg !== dark.colour,
    `text ${dark.colour} on ${dark.bg}, height ${dark.height}px`
  );
  await page.screenshot({ path: join(SHOTS, "06-delivery-dark-1440.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  // ── 9. The application still works, signed in as a fresh throwaway user ────────────────────────
  await signIn(page);
  record(
    "a fresh account reaches the workbench on the built app",
    page.url().includes("/app/projects"),
    `landed on ${page.url().replace(BASE, "")} as ${EMAIL}`
  );

  // ── 10. The screenshots the report quotes ──────────────────────────────────────────────────────
  for (const [index, { route }] of NEW_PAGES.slice(0, 4).entries()) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.screenshot({
      path: join(SHOTS, `0${index + 1}-${route.replace(/\W+/g, "-").replace(/^-|-$/g, "")}-1440.png`),
      fullPage: true
    });
  }

  writeFileSync(join(SHOTS, "terminal-transcript.txt"), transcript.join("\n") + "\n");
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) afterwards`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length === 0 ? 0 : 1);
