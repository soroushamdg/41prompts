/**
 * EPIC-070's drive: a real test-mode purchase, on the BUILT app, watched.
 *
 *   # 1. a database of its own
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *
 *   # 2. the Stripe objects in the sandbox, and the price id into `plans`
 *   node scripts/with-stripe-env.mjs -- npx tsx scripts/stripe-products.mts
 *
 *   # 3. Stripe forwarding its own deliveries at the local route. It prints the signing secret;
 *   #    capture it to a file rather than to a terminal, because it is a credential.
 *   stripe listen --project-name 41prompts --print-secret > /tmp/41p-whsec
 *   stripe listen --project-name 41prompts --forward-to localhost:3170/api/stripe/webhook &
 *
 *   # 4. the built app and the worker, sharing that database
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3170)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/070.env
 *   set -a && . /tmp/070.env && set +a
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p E2E_RATE_LIMIT_OFF=1 FAKE_PROVIDER=1
 *   export STRIPE_WEBHOOK_SECRET=$(cat /tmp/41p-whsec)
 *   node scripts/with-stripe-env.mjs -- pnpm --filter @41prompts/web start --port 3170 &
 *   DEPLOY_ENV=development FAKE_PROVIDER=1 KEY_ENCRYPTION_SECRET=… pnpm --filter @41prompts/worker start &
 *
 *   npx tsx scripts/drive-epic-070.mts
 *
 * ## What only this can show
 *
 * Six things, and not one of them is reachable from the test suite:
 *
 * 1. **A purchase, end to end, with a card.** Checkout is Stripe's page, in Stripe's browser
 *    session, and the plan that comes back is written by a webhook Stripe delivered — three systems
 *    and two redirects. Every part of that is mocked in the suite and none of it is mocked here.
 * 2. **`/pricing` as pixels.** Three tiers whose lists are different lengths, in a grid that has to
 *    keep their buttons on one line, with one card standing further off the page than the other two.
 *    Every assertion about that text passes over a layout that has collapsed.
 * 3. **The run-limit refusal where a person meets it** — on the page, in words, naming the number
 *    and the plan, rather than in a log.
 * 4. **The BYO-key refusal on Free**, likewise.
 * 5. **The usage meter moving**, which is the one number on Settings → Billing that is derived from
 *    rows rather than stored, so it is also the one that can silently be zero.
 * 6. **The webhook replay**, at the end: `stripe events resend` against a route that has already
 *    seen the event, proving one subscription row rather than two against Stripe's own delivery.
 *    `webhook.test.ts` proves the property offline; this proves Stripe does what we think it does.
 *
 * ## The two things this deliberately changes in the database, and why that is not seeding
 *
 * `plans.monthly_run_limit` for Free is lowered to **1** for one section, and put back. Fifty runs
 * through the UI to photograph a refusal is not a drive, it is an afternoon — and the limit is
 * deployment configuration in the same category as the cents cap, not account data. **Everything
 * the account owns is still made by clicking**: the project, the prompt, the bloks, the variable,
 * the inputs and the run. `docs/AUTONOMOUS.md` is explicit that driving the creation path is part
 * of the test, and the only thing shortened here is the wait.
 *
 * ## It is watched, not headless
 *
 * It opens the built app in the IDE preview pane and drives it in a visible browser.
 * `DRIVE_HEADLESS=1` keeps working, because `gates.mjs ci` runs unattended and must never wait on a
 * window.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3170";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-070");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-070-${Date.now()}@example.com`;

const IDE = "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide";
let paneWarned = false;
const pane = (url: string): void => {
  try {
    execFile(IDE, ["--open-url", `antigravity-ide://local.drive-preview/open?url=${encodeURIComponent(url)}`], (error) => {
      if (error && !paneWarned) {
        paneWarned = true;
        console.log(`preview pane unavailable (${error.message.split("\n")[0]}) — the drive carries on`);
      }
    });
  } catch (error) {
    if (!paneWarned) {
      paneWarned = true;
      console.log(`preview pane unavailable (${String(error)}) — the drive carries on`);
    }
  }
};

const results: { name: string; ok: boolean; detail: string }[] = [];
const transcript: string[] = [];
const record = (name: string, ok: boolean, detail: string): void => {
  results.push({ name, ok, detail });
  const line = `${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`;
  transcript.push(line);
  console.log(line);
};

/** One statement against the drive's own Postgres. Never a production database; the port says so. */
function psql(sql: string): string {
  return execFileSync("docker", ["exec", "-i", "41p-e2e-postgres", "psql", "-U", "41p", "-d", "41p", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

/** The Stripe CLI, against the sandbox. Output is returned; nothing here prints a key. */
function stripeCli(args: string[]): string {
  return execFileSync("stripe", [...args, "--project-name", "41prompts"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

async function shoot(page: Page, file: string, selector?: string): Promise<void> {
  const path = join(SHOTS, file);
  if (selector === undefined) {
    await page.screenshot({ path, fullPage: true });
    return;
  }
  const element = page.locator(selector).first();
  await element.scrollIntoViewIfNeeded();
  const box = await element.boundingBox();
  if (box === null) {
    await page.screenshot({ path });
    return;
  }
  await page.screenshot({
    path,
    clip: { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: box.width + 20, height: box.height + 20 },
  });
}

async function dismissConsent(page: Page): Promise<void> {
  await page.context().addCookies([
    { name: "41prompts_analytics_consent", value: "denied", domain: "localhost", path: "/" },
  ]);
}

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((next) => document.documentElement.setAttribute("data-theme", next), theme);
  await page.waitForFunction((next) => document.documentElement.getAttribute("data-theme") === next, theme);
  await page.waitForTimeout(350);
}

const sideways = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

pane(BASE);
console.log(`cleanup before: ${await deleteDriveUsers()} drive user(s) removed`);

const browser = await chromium.launch({
  headless: process.env.DRIVE_HEADLESS === "1",
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 250,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(45_000);
await dismissConsent(page);

try {
  // ── 1. /pricing, reached the way a reader reaches it ─────────────────────────────────────────

  await page.goto(BASE, { waitUntil: "networkidle" });
  pane(BASE);
  await page.getByRole("link", { name: "See pricing" }).click();
  await page.waitForURL(/\/pricing$/);
  pane(`${BASE}/pricing`);

  const styled = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { background: body.backgroundColor, family: body.fontFamily };
  });
  record(
    "the built app serves /pricing styled, reached by clicking the home page's own button",
    styled.background !== "rgba(0, 0, 0, 0)" && styled.family.length > 0,
    JSON.stringify(styled)
  );

  const tiers = await page.locator(".price-tier").count();
  const amounts = await page.locator(".price-amount").allInnerTexts();
  record("three tiers, and two of them carry an amount", tiers === 3 && amounts.length === 2, `${tiers} tiers · ${amounts.join(" · ")}`);
  record("Pro's amount is $29, formatted from the cents the parity test compares", amounts.includes("$29"), amounts.join(" · "));
  record("Free's amount is $0", amounts.includes("$0"), amounts.join(" · "));

  // ADR-007 §6, as a picture: a tier with nothing to sell has no number and no list.
  const teamCard = page.locator(".price-tier").nth(2);
  record(
    "Team has no amount and no feature list, and says so rather than showing an empty card",
    (await teamCard.locator(".price-amount").count()) === 0 &&
      (await teamCard.locator(".price-features li").count()) === 0 &&
      (await teamCard.locator(".price-cadence").innerText()).includes("No price yet"),
    await teamCard.innerText().then((text) => text.replace(/\n/g, " · ").slice(0, 80))
  );

  /**
   * **The defect the first drive's screenshot showed and its assertions missed.**
   *
   * Team rendered as a tall box with a heading, a button, and seven hundred pixels of nothing
   * between them — the same shape EPIC-072b found on `/about`, and the same cause: correct content
   * in a layout drawn for more of it. Every assertion above passed over it.
   *
   * **The obvious measurement is a trap and was written first.** "How much of the card do its
   * children span" is 94% for all three tiers whether or not Team has any content, because
   * `margin-top: auto` pins the button to the bottom either way — a guard that cannot fail. What
   * actually distinguishes the two versions is whether the column **says anything**, so that is
   * what is counted: the tier's text with its name, amount, cadence and button removed. The empty
   * version scored zero here.
   */
  const bodyText = await page.locator(".price-tier").evaluateAll((nodes) =>
    nodes.map((node) => {
      const chrome = new Set([
        ...node.querySelectorAll(".price-name, .price-amount, .price-cadence, .price-cta"),
      ]);
      return [...node.children]
        .filter((child) => !chrome.has(child))
        .map((child) => (child.textContent ?? "").trim())
        .join(" ").length;
    })
  );
  record(
    "every tier says something between its name and its button, so none reads as a card that failed to load",
    bodyText.every((length) => length > 120),
    bodyText.map((length) => `${length} chars`).join(" · ")
  );

  // The mockup's `.tier.best`: the recommended card stands further off the page than its neighbours.
  const shadows = await page.locator(".price-tier").evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).boxShadow));
  record("the Pro card is plated heavier than the other two, as the mockup draws it", shadows[1] !== shadows[0] && shadows[0] === shadows[2], shadows.map((s) => s.split(" ").slice(-3).join(" ")).join(" | "));

  // The three buttons sit on one line, which is the whole job of `margin-top: auto` and the thing
  // three lists of different lengths break.
  const ctaTops = await page.locator(".price-cta").evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().top)));
  record("the three buttons line up, though the three lists are different lengths", new Set(ctaTops).size === 1, ctaTops.join(" · "));

  record(
    "the nav marks Pricing as the current page",
    (await page.locator('.site-nav a[href="/pricing"]').getAttribute("aria-current")) === "page",
    "aria-current"
  );

  await shoot(page, "01-pricing-1440-light.png");
  await setTheme(page, "dark");
  await shoot(page, "02-pricing-1440-dark.png");
  await setTheme(page, "light");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  pane(`${BASE}/pricing`);
  const overflow = await sideways(page);
  record("/pricing does not scroll sideways at 390px", overflow <= 0, `overflow ${overflow}px`);
  await shoot(page, "03-pricing-390.png");
  await page.setViewportSize({ width: 1440, height: 950 });

  // ── 2. Sign in as somebody who has never bought anything ─────────────────────────────────────

  await page.goto(`${BASE}/sign-in?next=%2Fapp%2Fprojects`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 20_000 });
  const token = psql(
    `select identifier from verifications where value::jsonb ->> 'email' = '${EMAIL}' order by created_at desc limit 1;`
  );
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/app/projects`);
  await page.waitForURL(/\/app\/projects/);

  // ── 3. Settings → Billing, before anything is bought ─────────────────────────────────────────

  await page.goto(`${BASE}/app/settings/billing`, { waitUntil: "networkidle" });
  pane(`${BASE}/app/settings/billing`);
  const freeMeter = await page.getByRole("region", { name: "Plan and usage" }).innerText();
  record(
    "Billing shows the Free plan, the meter at zero of fifty, and the date the period starts again",
    freeMeter.includes("Free") && /0 of 50 runs used/.test(freeMeter) && /starts again on/.test(freeMeter),
    freeMeter.replace(/\n/g, " · ").slice(0, 110)
  );
  await shoot(page, "04-billing-free.png", ".app-page");

  // ── 4. The BYO-key refusal on Free ───────────────────────────────────────────────────────────

  await page.goto(`${BASE}/app/settings/providers`, { waitUntil: "networkidle" });
  pane(`${BASE}/app/settings/providers`);
  await page.getByLabel("Anthropic API key").fill("sk-ant-a-key-this-drive-invented");
  await page.getByRole("button", { name: "Save Anthropic key" }).click();
  const byoMessage = await page.getByTestId("message-anthropic").innerText();
  record(
    "a Free account is refused a provider key, in words that name Pro and where to change it",
    byoMessage.includes("Pro feature") && byoMessage.includes("Settings → Billing"),
    byoMessage.slice(0, 120)
  );
  record(
    "and nothing was stored, so the refusal is a refusal rather than a message over a write",
    psql(`select count(*) from provider_keys pk join users u on u.id = pk.owner where u.email = '${EMAIL}';`) === "0",
    "provider_keys rows: 0"
  );
  await shoot(page, "05-byo-refused-on-free.png", ".runs-panel");

  // ── 5. A run, then the run-limit refusal ─────────────────────────────────────────────────────
  //
  // The Free limit drops to 1 for this section only. See the header: the limit is deployment
  // configuration, and everything the account owns below is still made by clicking.

  psql("update plans set monthly_run_limit = 1 where key = 'free';");

  await page.goto(`${BASE}/app/projects`, { waitUntil: "networkidle" });
  await page.getByLabel("New project").fill(`Billing drive ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByLabel("New prompt").fill("Scheduler");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}$/);
  const promptId = page.url().split("/").pop() as string;

  await page.getByRole("button", { name: "+ Add blok" }).click();
  await page.getByRole("menuitem", { name: "Add context" }).click();
  await page.locator(".canvas-list > li").nth(0).getByLabel("Blok text").fill("You turn a sentence into a calendar entry. {{request}}");
  await page.getByRole("tab", { name: "Variables" }).click();
  await page.getByRole("button", { name: "Declare request" }).click();

  await page.goto(`${BASE}/app/pr/${promptId}/runs`, { waitUntil: "networkidle" });
  pane(`${BASE}/app/pr/${promptId}/runs`);
  await page.getByRole("button", { name: "add inputs by hand" }).click();
  await page.getByTestId("cell-0-0").fill("Book a 30 minute standup for the backend team");
  await page.getByTestId("by-hand-name").fill("Typed by hand");
  await page.getByRole("button", { name: "Save inputs" }).click();
  await page.getByRole("button", { name: "Run Typed by hand" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}\/runs\/srun_/, { timeout: 60_000 });

  await page.goto(`${BASE}/app/pr/${promptId}/runs`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Run Typed by hand|Duplicate and edit Typed by hand/ }).first().click();
  // The second run is the one the gate refuses. It is refused **before a row exists**, so the
  // refusal does not itself consume the quota it refused — `plan-gate.ts`'s whole argument.
  const refusal = await page.getByRole("region", { name: "Inputs" }).locator(".app-form-message").innerText();
  record(
    "a run past the plan's limit is refused on the page, naming the number, the plan and the reset date",
    /all 1 run on the Free plan/.test(refusal) && /starts again on/.test(refusal),
    refusal.slice(0, 130)
  );
  await shoot(page, "06-run-limit-refused.png", ".app-page");

  const suiteRuns = psql(`select count(*) from suite_runs sr join users u on u.id = sr.owner where u.email = '${EMAIL}';`);
  record("and the refused run wrote no row, so a refusal cannot spend the quota", suiteRuns === "1", `suite_runs: ${suiteRuns}`);

  psql("update plans set monthly_run_limit = 50 where key = 'free';");

  // ── 6. Checkout, with a card ─────────────────────────────────────────────────────────────────

  await page.goto(`${BASE}/app/settings/billing`, { waitUntil: "networkidle" });
  pane(`${BASE}/app/settings/billing`);
  await page.getByRole("button", { name: /Start a 14-day trial|Upgrade to Pro/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  record("the Upgrade button reaches Stripe's own Checkout", page.url().includes("checkout.stripe.com"), new URL(page.url()).host);
  await page.waitForLoadState("networkidle");
  await shoot(page, "07-stripe-checkout.png");

  // Stripe Checkout renders its fields in the top document in test mode. Both shapes are tried,
  // because which one is served depends on the account's payment-method settings.
  const cardNumber = page.locator("#cardNumber, input[name='cardNumber']").first();
  await cardNumber.waitFor({ timeout: 45_000 });
  await cardNumber.fill("4242424242424242");
  await page.locator("#cardExpiry, input[name='cardExpiry']").first().fill("12 / 34");
  await page.locator("#cardCvc, input[name='cardCvc']").first().fill("123");
  const name = page.locator("#billingName, input[name='billingName']").first();
  if (await name.isVisible().catch(() => false)) await name.fill("Claude Drive");
  const postal = page.locator("#billingPostalCode, input[name='billingPostalCode']").first();
  if (await postal.isVisible().catch(() => false)) await postal.fill("42424");

  await page.getByTestId("hosted-payment-submit-button").click();
  await page.waitForURL(/\/app\/settings\/billing\?bought=/, { timeout: 120_000 });
  pane(page.url());
  record("Checkout completes and returns to Settings → Billing", page.url().includes("bought="), "returned with a session id");

  // ── 7. The plan the webhook wrote ────────────────────────────────────────────────────────────
  //
  // Stripe delivers `checkout.session.completed` and the subscription events over `stripe listen`,
  // and they can land a moment after the redirect. The page says so in words rather than claiming
  // the plan; this waits for the thing the page told the reader to wait for.

  let planText = "";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.reload({ waitUntil: "networkidle" });
    planText = await page.getByRole("region", { name: "Plan and usage" }).innerText();
    if (planText.includes("Pro")) break;
    await page.waitForTimeout(1_000);
  }
  record(
    "the plan the webhook wrote is Pro, with Pro's run limit and Stripe's own period end",
    planText.includes("Pro") && /of 5000 runs used/.test(planText) && /starts again on/.test(planText),
    planText.replace(/\n/g, " · ").slice(0, 120)
  );
  await shoot(page, "08-billing-pro.png", ".app-page");

  const rows = psql(
    `select count(*) from subscriptions s join users u on u.id = s.owner where u.email = '${EMAIL}';`
  );
  record("exactly one subscription row exists after the purchase", rows === "1", `subscriptions: ${rows}`);

  // ── 8. BYO keys, now that the account is on Pro ──────────────────────────────────────────────

  await page.goto(`${BASE}/app/settings/providers`, { waitUntil: "networkidle" });
  await page.getByLabel("Anthropic API key").fill("sk-ant-a-key-this-drive-invented");
  await page.getByRole("button", { name: "Save Anthropic key" }).click();
  const proKeyMessage = await page.getByTestId("message-anthropic").innerText();
  record(
    "the same account on Pro is no longer refused the key — the plan gate is what changed, not the form",
    !proKeyMessage.includes("Pro feature"),
    proKeyMessage.slice(0, 110)
  );
  await shoot(page, "09-byo-allowed-on-pro.png", ".runs-panel");

  // ── 9. The replay: Stripe's own delivery, twice ──────────────────────────────────────────────
  //
  // The acceptance criterion the epic calls the money bug. `webhook.test.ts` proves the property
  // offline against a fixture; this proves it against an event Stripe actually sent.

  const before = psql(
    `select count(*) from subscriptions s join users u on u.id = s.owner where u.email = '${EMAIL}';`
  );
  const periodBefore = psql(
    `select current_period_start || '|' || current_period_end from subscriptions s join users u on u.id = s.owner where u.email = '${EMAIL}';`
  );

  const recorded = psql("select id from stripe_events where type = 'customer.subscription.created' order by received_at desc limit 1;");
  record("the subscription event is in the ledger, so there is something to replay", recorded.startsWith("evt_"), recorded.slice(0, 12) + "…");

  stripeCli(["events", "resend", recorded]);
  await page.waitForTimeout(4_000);

  const after = psql(
    `select count(*) from subscriptions s join users u on u.id = s.owner where u.email = '${EMAIL}';`
  );
  const periodAfter = psql(
    `select current_period_start || '|' || current_period_end from subscriptions s join users u on u.id = s.owner where u.email = '${EMAIL}';`
  );
  record(
    "Stripe redelivered the same event and it left one subscription row and one period",
    before === "1" && after === "1" && periodBefore === periodAfter,
    `rows ${before} → ${after} · period unchanged: ${periodBefore === periodAfter}`
  );

  // ── 10. The portal, which is where a subscription is changed or cancelled ────────────────────

  await page.goto(`${BASE}/app/settings/billing`, { waitUntil: "networkidle" });
  const portal = page.getByRole("button", { name: "Manage billing" });
  record("the page offers a portal button once there is a subscription to manage", await portal.isVisible(), "Manage billing");
  await portal.click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000 });
  // **Strict, and it was not on the first drive.** The first version accepted either "the portal
  // opened" or "the page said it is not configured", which is a test that passes both ways — and it
  // passed on the second, because `billingPortal.sessions.create` needs a default configuration the
  // account did not have. `provision.ts` creates one now, so this asserts the thing itself.
  record("the customer portal opens", page.url().includes("billing.stripe.com"), new URL(page.url()).host);
  await page.waitForLoadState("networkidle");
  await shoot(page, "10-stripe-portal.png");
} finally {
  await browser.close();
  // **After the verification, never as an unconditional final act** — EPIC-031a's drive deleted its
  // own user last and cascaded away the evidence the epic existed to collect.
  console.log(`cleanup after: ${await deleteDriveUsers()} drive user(s) removed`);
  try {
    psql("update plans set monthly_run_limit = 50 where key = 'free';");
  } catch {
    // The database may already be gone; the limit only ever lived in a throwaway container.
  }
}

const passed = results.filter((result) => result.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
