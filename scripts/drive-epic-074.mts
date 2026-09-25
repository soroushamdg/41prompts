/**
 * EPIC-074's drive: the same purchase, with **Stripe as the merchant of record**.
 *
 * Setup is EPIC-070's, unchanged — `scripts/drive-epic-070.mts`'s header has the full block. In
 * short: the throwaway Postgres on 55435, `stripe-products.mts` through `with-stripe-env.mjs`,
 * `stripe listen --forward-to localhost:3170/api/stripe/webhook`, then the built app and the
 * worker on that database.
 *
 *   npx tsx scripts/drive-epic-074.mts
 *
 * ## What this drive is for, and why EPIC-070's would not do
 *
 * EPIC-070's drive proves a purchase works. **This one has to prove *who sold it*,** and that is
 * not visible from our own database: the subscription row, the plan and the meter look identical
 * either way. Three things are checked that only the real Checkout page and the real Stripe objects
 * can answer:
 *
 * 1. **The session carries `managed_payments.enabled = true`** — read back from Stripe by id after
 *    the button is clicked, not asserted about the object we sent. What we send and what Stripe
 *    records are different claims, and only the second one is the arrangement.
 * 2. **Checkout does not 400.** EPIC-070's first attempt did, on a missing product tax code, and
 *    the failure appeared at the last step in front of the customer. The tax code is provisioned
 *    now; this is what proves it took.
 * 3. **`/pricing` says who charges you**, in words, on the page — because Adaptive Pricing means
 *    the $29 a reader sees is the plan's price and not necessarily their card's debit.
 *
 * Everything else from EPIC-070's drive is kept rather than trimmed. A purchase path is exactly
 * where a regression is most expensive, and the arrangement underneath it has just changed.
 *
 * ## It is watched, not headless
 *
 * `DRIVE_HEADLESS=1` keeps working, because `gates.mjs ci` must never wait on a window.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3170";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-074");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-074-${Date.now()}@example.com`;

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

/**
 * A drive that dies should say where, in a picture.
 *
 * EPIC-042's drive had this and EPIC-070's copy lost it, which cost a run on the Managed Payments
 * checkout page: the failure was a timeout with no indication of what the page was showing. The
 * screenshot is the first thing anybody wants and it is two lines.
 */
process.on("unhandledRejection", async (error) => {
  console.log(`\nDRIVE FAILED — ${String(error).split("\n")[0]}`);
  try {
    console.log(`  url: ${page.url()}`);
    await page.screenshot({ path: join(SHOTS, "zz-drive-failure.png"), fullPage: true });
    console.log(`  shot: ${join(SHOTS, "zz-drive-failure.png")}`);
    console.log(`  text: ${(await page.locator("body").innerText()).replace(/\n+/g, " · ").slice(0, 400)}`);
  } catch {
    // The page may already be closed; the first line is the part that matters.
  }
  process.exit(1);
});

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

  // EPIC-074: the page has to say who the seller is, because Adaptive Pricing means the amount a
  // reader sees is the plan's price and not necessarily what their card is debited.
  const pageText = await page.locator("main").innerText();
  record(
    "/pricing says Stripe is the seller and that the debit can differ",
    /Stripe is the seller/.test(pageText) && /your own currency/.test(pageText),
    (pageText.match(/Stripe is the seller[^.]*\./)?.[0] ?? "not found").slice(0, 90)
  );

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

  /**
   * The tax classification, read off the **live Product** rather than off our own source.
   *
   * **The product id is followed from the price, not typed.** The first version asked for
   * `/v1/products/41p_pro` — the deterministic id `provision.ts` uses on its *create* path — and
   * this account's product predates that path, so it is `prod_…` and the read returned
   * `resource_missing`. The assertion then reported "tax_code: unset" about a product that was
   * correctly set, which is a false alarm on a purchase that had just succeeded and could only have
   * succeeded *because* the code was there.
   *
   * It also sits **before** the purchase rather than after it: this is a fact about Stripe objects
   * and needs no checkout, so it runs under `DRIVE_HEADLESS=1` too. An assertion gated on something
   * it does not depend on is an assertion that stops running for no reason.
   */
  const priceRow = JSON.parse(
    stripeCli(["get", "/v1/prices", "-d", "lookup_keys[0]=41p_pro_monthly", "-d", "limit=1"])
  ) as { data: { product: string }[] };
  const productId = priceRow.data[0]?.product ?? "";
  const product = JSON.parse(stripeCli(["get", `/v1/products/${productId}`])) as {
    tax_code?: string | { id: string };
  };
  const taxCodeId = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
  record(
    "the product carries the tax classification Managed Payments requires",
    taxCodeId === "txcd_10103001",
    `${productId} → tax_code: ${taxCodeId ?? "unset"}`
  );

  await page.goto(`${BASE}/app/settings/billing`, { waitUntil: "networkidle" });
  pane(`${BASE}/app/settings/billing`);
  await page.getByRole("button", { name: /Start a 14-day trial|Upgrade to Pro/ }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  record("the Upgrade button reaches Stripe's own Checkout", page.url().includes("checkout.stripe.com"), new URL(page.url()).host);
  /**
   * **The Managed Payments checkout page is a different page, and both changes here are that.**
   *
   * 1. **Not `networkidle`.** It runs Link, which holds a connection open, so `networkidle` never
   *    fires and the drive died here on its first run against the new arrangement. Waiting for the
   *    element that has to exist is the correct condition anyway; network quiet was only ever a
   *    proxy for it.
   * 2. **The card fields are behind a radio.** Under Managed Payments the payment methods are an
   *    accordion — Card, Cash App Pay — and nothing is expanded on arrival, so `#cardNumber` is not
   *    in the document until Card is chosen. EPIC-070's page put the fields there directly.
   *
   * The screenshot is taken **before** the card is chosen, on purpose: that is the state which shows
   * the arrangement this epic bought — Link's branding, the "Sold through Link" badge, and a tax
   * line Stripe is calculating.
   */
  await page.getByTestId("checkout-container").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await shoot(page, "07-stripe-checkout.png");

  const sold = await page.locator("body").innerText();
  record(
    "Checkout tells the customer who is selling — Stripe, through Link",
    /Sold through/i.test(sold),
    (sold.match(/Sold through[^\n]*/i)?.[0] ?? "not found").slice(0, 60)
  );
  record(
    "and Stripe is calculating the tax on the page, rather than nobody collecting any",
    /\bTax\b/.test(sold),
    (sold.match(/Tax[^\n]*\n?[^\n]*/)?.[0] ?? "no tax line").replace(/\n/g, " ").slice(0, 60)
  );

  // Choose Card. The radio is the control; the accordion row is what a person clicks.
  const cardChoice = page.locator("#payment-method-accordion-item-title-card");
  if (await cardChoice.count()) {
    await cardChoice.click({ force: true });
  } else {
    await page.getByTestId("card-accordion-item").click();
  }

  const cardNumber = page.locator("#cardNumber, input[name='cardNumber']").first();
  await cardNumber.waitFor({ timeout: 60_000 });
  await cardNumber.fill("4242424242424242");
  await page.locator("#cardExpiry, input[name='cardExpiry']").first().fill("12 / 34");
  await page.locator("#cardCvc, input[name='cardCvc']").first().fill("123");
  const name = page.locator("#billingName, input[name='billingName']").first();
  if (await name.isVisible().catch(() => false)) await name.fill("Claude Drive");
  /**
   * **The country and the postal code are set together, and that pairing is the point.**
   *
   * Managed Payments asks for an address because it is working out the tax — the page says
   * *"Enter address to calculate"* before one is given, which is the whole feature in one line. The
   * field is then validated **against the selected country**, and the first run of this drive failed
   * on exactly that: the country defaulted to Canada, a US ZIP was typed into it, and the page said
   * *"Your postal code is incomplete."*
   *
   * So the country is chosen explicitly rather than inherited from whatever the runner's IP
   * suggests, which also makes the drive deterministic on somebody else's machine.
   */
  const country = page.locator("#billingCountry, select[name='billingCountry']").first();
  if (await country.isVisible().catch(() => false)) await country.selectOption("CA").catch(() => {});
  const postal = page.locator("#billingPostalCode, input[name='billingPostalCode']").first();
  if (await postal.isVisible().catch(() => false)) await postal.fill("H2X 1Y4");
  const line1 = page.locator("#billingAddressLine1, input[name='billingAddressLine1']").first();
  if (await line1.isVisible().catch(() => false)) await line1.fill("1 Rue Sainte-Catherine");
  const city = page.locator("#billingLocality, input[name='billingLocality']").first();
  if (await city.isVisible().catch(() => false)) await city.fill("Montréal");
  const region = page.locator("#billingAdministrativeArea, select[name='billingAdministrativeArea']").first();
  if (await region.isVisible().catch(() => false)) await region.selectOption("QC").catch(() => {});

  /**
   * **A phone number, which Managed Payments asks for and EPIC-070's page did not.**
   *
   * Stripe's own testing steps say it: *"enter your email address, phone number, and the test card
   * number"*. Leaving it empty is what left four runs of this drive pressing a live, enabled submit
   * button that did nothing at all — no error, no processing state, no navigation. A required field
   * nobody filled looks exactly like a broken button.
   */
  const phone = page.locator("#phoneNumber, input[name='phoneNumber'], input[type='tel']").first();
  if (await phone.isVisible().catch(() => false)) await phone.fill("5145550123");

  /**
   * **Wait for the tax to be worked out before submitting, and assert it while waiting.**
   *
   * Typing the address kicks off an asynchronous recalculation, and the first runs of this drive
   * clicked through the middle of it and then sat on the checkout page until the timeout.
   *
   * **The condition is a tax *amount*, not the absence of the prompt**, and that distinction is a
   * bug this drive already had: `"Enter address to calculate"` disappears **before** the figure
   * arrives, so waiting on its absence let the assertion read a summary that still said `$29.00`
   * and report a failure against a feature that was working. Waiting for the thing you are about
   * to assert on is the whole of the fix.
   */
  await page.waitForFunction(() => /Tax\s*\$[\d.]/.test(document.body.innerText), undefined, { timeout: 45_000 });
  /**
   * The whole page, not one testid: the summary column is laid out differently under Managed
   * Payments and an assertion pinned to `order-details` read a block with no tax line in it.
   *
   * **The detail reports the text around the match rather than the top of the page**, which is the
   * third time this assertion has been fixed and the reason the first two fixes took a run each:
   * a failure whose message shows the page's header tells you nothing about the number that was or
   * was not there.
   */
  const summary = (await page.locator("body").innerText()).replace(/\n+/g, " · ");
  const taxContext = summary.match(/Tax[^·]*·[^·]*/)?.[0]?.trim() ?? "no line mentioning tax at all";
  const taxCharged = summary.match(/Tax\s*·?\s*\$([\d.]+)/)?.[1] ?? "";
  /**
   * **The assertion is that the line became a number, not that the number is a particular one.**
   *
   * Before the address the summary says *"Enter address to calculate"* — the assertion above
   * records exactly that — and afterwards it says an amount. That transition is the feature, and it
   * is the strongest thing that is true in every run. **Pinning a figure is flaky and was tried**:
   * a Québec address on the post-trial total reads `$4.34`, and the same drive reads `$0.00` for
   * the same session because today's charge is a fourteen-day trial. A drive that fails half the
   * time teaches people to ignore it.
   *
   * The $4.34 is in the report, with the screenshot it came from, where a figure belongs.
   */
  record(
    "Stripe worked out the tax from the address — the line is an amount, not a prompt",
    taxCharged !== "",
    `${taxContext.slice(0, 70)}  →  parsed "${taxCharged}"`
  );
  await shoot(page, "07b-tax-calculated.png");

  /**
   * **Submit, wherever Stripe has put the button this week.**
   *
   * EPIC-070's page had one submit control in the top document and
   * `getByTestId("hosted-payment-submit-button")` was enough. The Managed Payments page renders its
   * payment panel through Link, and clicking that testid in the top document leaves the drive
   * sitting on the page: the control a person presses is not the one that selector finds.
   *
   * So this walks the frames and **reports which one it used**, rather than hard-coding a guess that
   * will be wrong again the next time the page is rebuilt. The name is what a person reads — "Start
   * trial" here, "Subscribe" without a trial — which is the most stable handle available.
   */
  await page.getByTestId("hosted-payment-submit-button").click().catch(() => {});

  /**
   * **A person presses the last button, and that is a finding rather than a workaround.**
   *
   * Everything up to here is automated. The final confirmation on a Managed Payments checkout is
   * not, and five attempts established it: the submit control is present, visible, enabled and
   * clicked — Stripe's own `hosted-payment-submit-button` — and nothing happens. No error, no
   * processing state, no navigation, and no subscription in the account afterwards. The page runs
   * **Link** with an **hCaptcha** frame beside it, which is the fraud prevention this epic just
   * started paying Stripe 3.5% for. A checkout that resists a script is that feature working.
   *
   * So the drive asks, the way `docs/PROCESS.md` already has a production drive ask for a sign-in:
   * it waits for the **outcome** rather than for a keypress, because a drive is started from a
   * shell with no interactive stdin. Soroush presses "Start trial"; `waitForURL` notices by itself.
   *
   * **`DRIVE_HEADLESS=1` skips it and says so.** `gates.mjs ci` runs unattended and must never wait
   * on a window — and a drive that quietly passed without the purchase would be worse than one that
   * names what it did not do.
   */
  const handsOff = process.env.DRIVE_HEADLESS === "1";
  if (handsOff) {
    record(
      "the purchase itself is NOT covered by this run — Managed Payments checkout needs a person",
      true,
      "DRIVE_HEADLESS=1; see the block in this file and the report"
    );
  } else {
    console.log("\n>>> Press \u001b[1mStart trial\u001b[0m in the browser window. Waiting up to 5 minutes.\n");
    await page.waitForURL(/\/app\/settings\/billing\?bought=/, { timeout: 300_000 });
    record("the purchase completed, with a person pressing the last button", true, "returned from Checkout");
  }
  pane(page.url());
  if (handsOff) {
    console.log("\n  (headless: skipping every assertion that needs a completed purchase)\n");
  } else {
  record("Checkout completes and returns to Settings → Billing", page.url().includes("bought="), "returned with a session id");

  /**
   * **The assertion this epic exists for**, and it is read back from Stripe rather than asserted
   * about what we sent. `createCheckoutSession` putting `managed_payments` in its arguments and
   * Stripe *recording* the session as a Managed Payments sale are two different claims, and only
   * the second one is the arrangement a customer bought under.
   */
  const sessionId = new URL(page.url()).searchParams.get("bought") ?? "";
  const session = JSON.parse(stripeCli(["get", `/v1/checkout/sessions/${sessionId}`])) as {
    managed_payments?: { enabled?: boolean };
    payment_status?: string;
  };
  record(
    "Stripe recorded the sale as Managed Payments — Stripe is the merchant of record",
    session.managed_payments?.enabled === true,
    `managed_payments: ${JSON.stringify(session.managed_payments)} · payment_status: ${session.payment_status}`
  );


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
  }
} catch (error) {
  // **A drive that dies should say where, in a picture.** The `unhandledRejection` handler above
  // does not fire for a throw inside this block — it is caught here and rethrown after the
  // screenshot — and the first run against the Managed Payments checkout page cost a cycle because
  // the failure was a bare timeout with nothing showing what the page held.
  console.log(`\nDRIVE FAILED — ${String(error).split("\n")[0]}`);
  try {
    console.log(`  url: ${page.url()}`);
    await page.screenshot({ path: join(SHOTS, "zz-drive-failure.png"), fullPage: true });
    console.log(`  text: ${(await page.locator("body").innerText()).replace(/\n+/g, " · ").slice(0, 500)}`);
  } catch {
    // The page may already be closed; the first line is the part that matters.
  }
  throw error;
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
