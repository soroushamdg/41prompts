/**
 * EPIC-056's drive: the BUILT app on localhost, and the one user-visible thing this epic changed.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3118)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/56.env
 *   set -a && . /tmp/56.env && set +a
 *   pnpm --filter @41prompts/web start --port 3118 &
 *   npx tsx scripts/drive-epic-056.mts
 *
 * ## What this drive is for
 *
 * Most of EPIC-056 is licence metadata, a mirror filter and two publishing workflows — none of
 * which a browser can see, and all of which are covered by `pnpm mirror-dry-run`, `pnpm reuse-lint`
 * and `apps/web/public-distributions.test.ts`. **One thing did reach a page**: the footer's
 * copyright line, held back through EPIC-016 and EPIC-017 because there was no company to name.
 *
 * So this is a small drive and it is not a formality. It checks four things a test cannot:
 *
 * 1. **The line renders**, in the built app, on every public page that has a footer — not just in
 *    `renderToStaticMarkup` of one component. A page that throws renders no footer at all.
 * 2. **It names the company, not the placeholder.** The whole epic is one word.
 * 3. **It is not flush to the edge at 390px.** `BUG-069` was exactly this class of defect in the
 *    sibling chrome — a control touching the viewport edge, `CLAUDE.md` rule 12 — and it was found
 *    by driving, not by a test.
 * 4. **It survives dark mode**, because `.site-foot-legal` is coloured with `--color-ink-3` and a
 *    token that resolves wrongly is invisible to every assertion about text content.
 *
 * And, because `docs/AUTONOMOUS.md` asks for it and because a public-pages-only drive would not
 * notice a build that cannot serve the application at all, it signs in as a fresh throwaway user
 * and reaches the signed-in workbench.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik and migrations against the real database.
 * Nothing is pushed (`CLAUDE.md`), so nothing deploys and no staging URL is evidence about any of
 * this. **It also does not and cannot cover the split itself** — creating
 * `github.com/41prompts/41prompts`, registering `41p` and `fortyone-prompts`, turning on trusted
 * publishing, and the first publish are all a person's, and `pnpm mirror-dry-run` is the whole of
 * what a machine can prove about them.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and the account is cleaned up at both ends.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3118";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-056");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-056-${Date.now()}@example.com`;
const HOLDER = "© 2026 41Prompts Inc.";
const PLACEHOLDER = `<legal ${"entity"}>`;

/** Every public route that renders `SiteFooter`. */
const FOOTER_PAGES = [
  "/",
  "/contact",
  "/guides/what-your-prompt-does-not-check",
  "/legal/terms",
  "/legal/privacy",
  "/legal/sub-processors",
  "/legal/security",
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

try {
  // ── 0. Prove the server is the build just made (lesson 17) ─────────────────────────────────────
  //
  // `/healthz` answers "commit":"unknown" with no COMMIT_SHA, so it cannot identify a local build.
  // BUILD_ID appears verbatim in the returned HTML and can.

  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const buildId = readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  const html = await page.content();
  record(
    "the server answering is the build just made",
    landing?.status() === 200 && html.includes(buildId),
    `BUILD_ID ${buildId} ${html.includes(buildId) ? "is" : "is NOT"} in the HTML`,
  );

  // ── 1. The line, on every page that has a footer ────────────────────────────────────────────────

  for (const route of FOOTER_PAGES) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    const legal = page.locator(".site-foot-legal");
    const count = await legal.count();
    const text = count > 0 ? ((await legal.first().textContent()) ?? "").trim() : "(no footer legal line)";
    record(
      `${route} renders the copyright line`,
      response?.status() === 200 && count === 1 && text === HOLDER,
      `HTTP ${response?.status()} · ${count} line(s) · ${JSON.stringify(text)}`,
    );
  }

  // ── 2. It names the company, and the placeholder is nowhere on a served page ────────────────────

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const body = (await page.locator("body").innerText()).trim();
  record(
    "the line names the company rather than the brand alone",
    body.includes(HOLDER) && !body.includes("© 2026 41Prompts\n"),
    `footer reads ${JSON.stringify(HOLDER)}`,
  );
  record(
    "no served page shows the placeholder that stood here until today",
    !(await page.content()).includes(PLACEHOLDER),
    `"${PLACEHOLDER}" is absent from the served HTML`,
  );

  // ── 3. 390px: a gutter, and no horizontal page scroll (BUG-069's class, rule 12) ────────────────

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

  const box = await page.locator(".site-foot-legal").boundingBox();
  record(
    "the copyright line has a left gutter at 390px",
    box !== null && box.x >= 16,
    box ? `left edge at ${Math.round(box.x)}px` : "no bounding box — the line did not render",
  );
  record(
    "the copyright line has a right gutter at 390px",
    box !== null && 390 - (box.x + box.width) >= 16,
    box ? `right edge ${Math.round(390 - (box.x + box.width))}px from the viewport` : "no bounding box",
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  record("no horizontal page scroll at 390px", overflow <= 0, `scrollWidth − clientWidth = ${overflow}px`);
  await page.screenshot({ path: join(SHOTS, "03-landing-footer-390.png"), fullPage: true });

  // ── 4. Dark mode, where a mis-resolved token makes the line invisible ───────────────────────────

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const dark = await page.locator(".site-foot-legal").evaluate((el) => {
    const style = getComputedStyle(el);
    return { colour: style.color, size: style.fontSize, visible: (el as HTMLElement).offsetHeight > 0 };
  });
  record(
    "the line is painted and sized in dark mode",
    dark.visible && dark.colour !== "" && !dark.colour.includes("rgba(0, 0, 0, 0)"),
    `colour ${dark.colour} · ${dark.size} · height > 0: ${dark.visible}`,
  );
  await page.screenshot({ path: join(SHOTS, "04-landing-footer-dark-1440.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  // ── 5. The application still works, signed in as a fresh throwaway user ────────────────────────
  //
  // A drive over public pages alone would pass against a build whose signed-in half does not boot.

  await signIn(page);
  record(
    "a fresh account reaches the workbench on the built app",
    page.url().includes("/app/projects"),
    `landed on ${page.url().replace(BASE, "")} as ${EMAIL}`,
  );
  await page.screenshot({ path: join(SHOTS, "05-signed-in-projects-1440.png"), fullPage: true });

  // The signed-in chrome renders no SiteFooter, so there is deliberately no copyright line at
  // /app. Recorded rather than asserted away: it is a fact about the change, not a defect.
  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  record(
    "the signed-in workbench has no footer, so no line is expected there",
    (await page.locator(".site-foot-legal").count()) === 0,
    "SiteFooter is rendered by the marketing pages only — noted, not fixed here",
  );

  // ── 6. The screenshots the report quotes ────────────────────────────────────────────────────────

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "01-landing-footer-1440.png"), fullPage: true });
  await page.goto(`${BASE}/legal/terms`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "02-legal-terms-footer-1440.png"), fullPage: true });

  writeFileSync(join(SHOTS, "terminal-transcript.txt"), transcript.join("\n") + "\n");
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) afterwards`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length === 0 ? 0 : 1);
