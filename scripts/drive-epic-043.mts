/**
 * EPIC-043's browser drive, against the BUILT app on localhost.
 *
 * Run it with the built app already serving on :3000 and a database it can read:
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   pnpm --filter @41prompts/web start --port 3000     # with the same DATABASE_URL
 *   npx tsx scripts/drive-epic-043.mts
 *
 * `next start` needs the placeholders in `apps/web/e2e/env.mjs` and not invented ones — hand-made
 * values give *"Something went wrong."* on sign-in, which is Better Auth failing to construct.
 *
 * **`.mts` and `tsx`, unlike the `.mjs` drives before it.** This drive has to seal a key with the
 * real `packages/db` module rather than a reimplementation of it, and that module is TypeScript.
 * Reimplementing the envelope here to keep the script `.mjs` would mean the drive proved a copy.
 *
 * ## What this drive is for
 *
 * Two things, and they are different in kind.
 *
 * **1. The page.** `/legal/security` gains the provider-key guidance, which is the only thing in
 * this epic a person can see. It is rendered at 1440 and at 390, tabbed through, and read back — the
 * assertions only a built app can fail being that the stylesheet built and applied and that the page
 * renders at all in a production bundle.
 *
 * **2. The dump.** The epic's own reason for existing is that a copy of the database is not a copy of
 * anybody's key. `provider-keys.test.ts` asserts that against the text Postgres renders, because
 * `pg_dump` is not on this machine's PATH. It **is** inside the Postgres container, so this drive
 * runs the real one against a real sealed row and greps the bytes. That assertion cannot be made
 * honestly anywhere else, which is what makes it worth a drive on an epic that is mostly paper.
 *
 * There is no UI for storing a key — EPIC-042 builds it — so this drive seals through the store's own
 * function rather than by clicking. Stated rather than hidden: the creation path is not driven here
 * because there is no creation path yet, and driving one is EPIC-042's job.
 *
 * Cleanup runs first and last. **Last is after the verification, never as an unconditional final
 * act** — EPIC-031a's drive deleted its own user as its last step and cascaded away the evidence the
 * epic existed to collect.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createDb } from "../packages/db/src/client";
import { generateMasterKey } from "../packages/db/src/sealed-box";
import { openStoredProviderKey, providerKeyMetadata, putProviderKey } from "../packages/db/src/provider-keys";

const OUT = "docs/epics/reports/screenshots/EPIC-043";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://41p:41p@127.0.0.1:55435/41p";
const CONTAINER = process.env.PG_CONTAINER ?? "41p-e2e-postgres";
const email = `claude-drive-epic043-${Date.now()}@example.com`;

/**
 * A key shaped exactly like a real one, and not one — it has never existed at any provider.
 *
 * The tail is deliberately distinctive. The first version of this constant ended in ten zeros, so
 * `slice(-8)` was `"00000000"` and "the dump contains no fragment of the key" was asserting that a
 * dump has no run of eight zeros in it — a different claim, and a weaker one.
 */
const DRIVE_KEY = "sk-ant-api03-DriveOnlyNotARealKeyZqXw9182736450";

let shot = 0;
const fail: string[] = [];

function psql(sql: string): string {
  return execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "41p", "-d", "41p", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

function check(name: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail.push(name);
}

async function shoot(page: import("@playwright/test").Page, name: string): Promise<void> {
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  shot  ${file}`);
}

/** The standing cleanup, scoped by identity. `example.com` is RFC 2606 reserved; the prefix is ours. */
function cleanup(): void {
  psql("delete from users where email like 'claude-drive-%@example.com';");
}

cleanup();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
page.setDefaultTimeout(30_000);
page.on("pageerror", (error) => console.log("  [pageerror]", String(error).slice(0, 200)));

/**
 * Both handlers, not only `unhandledRejection`.
 *
 * A rejection out of a **top-level await** in an ES module arrives as an uncaught exception, not as
 * an unhandled rejection — so the earlier drives' single handler would print nothing, take no
 * screenshot and leave the browser running. Found the hard way on this drive's first real failure.
 */
const onFailure = async (error: unknown): Promise<never> => {
  console.log("\nDRIVE FAILED — " + String(error).split("\n")[0]);
  try {
    console.log("  url:", page.url());
    await page.screenshot({ path: `${OUT}/zz-drive-failure.png`, fullPage: true });
    await browser.close();
  } catch {
    // The page may already be closed; the first line is the part that matters.
  }
  process.exit(1);
};
process.on("unhandledRejection", onFailure);
process.on("uncaughtException", onFailure);

console.log("\nEPIC-043 — the provider-key guidance and the key store, driven against the built app\n");

// ── The page, signed out first, because /legal/security is public ──────────────────────────────
await page.goto("/legal/security");
await page.getByRole("heading", { level: 1 }).waitFor();

// EPIC-017's consent banner is fixed to the bottom of the viewport and, in a full-page screenshot,
// sits across the middle of the document — over exactly the section this epic added. Declining is
// what a person would do, and it is also what makes the screenshot a picture of the page.
const declineFirst = page.getByRole("button", { name: "Decline" });
if (await declineFirst.isVisible().catch(() => false)) await declineFirst.click();

const styled = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { background: body.backgroundColor, family: body.fontFamily };
});
check(
  "the built app is styled",
  styled.background !== "rgba(0, 0, 0, 0)" && styled.family.length > 0,
  JSON.stringify(styled),
);

const pageText = (await page.locator("main").innerText()).replace(/\s+/g, " ");

check(
  "the guidance has its own heading on the page",
  pageText.includes("If you bring your own provider key"),
);

// The three actions, each read back from the page rather than from the module, so this is a test of
// what rendered and not of what was exported.
for (const [name, phrase] of [
  ["scope it", "Make a key for 41Prompts alone"],
  ["cap it", "Set a spending limit on that key at your provider"],
  ["revoke it there", "Revoke it at your provider if anything looks wrong"],
] as const) {
  check(`the page tells a person to ${name}`, pageText.includes(phrase), phrase.slice(0, 40));
}

check(
  "the page says removing a key here is the smaller half, rather than implying it is enough",
  pageText.includes("which is the smaller half"),
);
check(
  "the page does not claim a key is stored today, because none is",
  pageText.includes("Nothing stores a provider key today"),
);
check(
  "the page promises to tell the owner directly, ahead of any legal duty",
  pageText.includes("immediately, whether or not that duty applied"),
);
// A legal page whose content moved but whose date did not is a small lie in the one place a reader
// checks whether to re-read it. This section was written on the 16th; the page said the 14th.
check(
  "the page's last-updated date moved with its content",
  pageText.includes("Last updated 16 September 2026"),
  pageText.slice(0, 60),
);

await shoot(page, "legal-security-1440");

/**
 * Rule 10: green, red and amber mean pass, fail and drift and nothing else. A guidance page claims
 * none of the three, so none of those tokens may be painted on it.
 *
 * **The first version of this compared a token's `#0b5c2e` against a computed `rgb(11, 92, 46)` and
 * could never match**, so it reported a clean page whatever the page did. Both sides are normalised
 * through the browser's own colour parser now, and the check refuses to run at all if it cannot find
 * the tokens it is looking for — a comparison against an empty set is not a pass.
 */
const paintedTokens = await page.evaluate(() => {
  // **No named inner function in here.** `tsx` compiles with esbuild's `keepNames`, which rewrites a
  // named arrow into `__name(fn, "…")` — and `__name` does not exist in the page, so Playwright
  // serialises a function that throws `ReferenceError` the moment it runs. Found by running it.
  //
  // The browser is the only thing that agrees with itself about colour notation, so the value is
  // painted onto a detached element and read back as whatever `getComputedStyle` calls it.
  const probe = document.createElement("span");
  document.body.appendChild(probe);

  const root = getComputedStyle(document.documentElement);
  const names = ["--color-pass", "--color-pass-soft", "--color-fail", "--color-fail-soft", "--color-warn", "--color-warn-soft"];
  const reserved = new Map<string, string>();
  for (const name of names) {
    const raw = root.getPropertyValue(name).trim();
    if (raw.length === 0) continue;
    probe.style.color = "";
    probe.style.color = raw;
    reserved.set(getComputedStyle(probe).color, name);
  }

  const used: string[] = [];
  for (const element of Array.from(document.querySelectorAll("main, main *"))) {
    const style = getComputedStyle(element);
    for (const value of [style.color, style.backgroundColor, style.borderTopColor]) {
      const name = reserved.get(value);
      if (name) used.push(`${element.tagName}:${name}`);
    }
  }
  probe.remove();
  return { found: reserved.size, sample: [...reserved.keys()][0] ?? "none", used };
});
// The control: if the tokens were not found, the loop above compared against nothing.
check(
  "the reserved status colours were actually found, so the check below means something",
  paintedTokens.found >= 4,
  `${paintedTokens.found} tokens, e.g. ${paintedTokens.sample}`,
);
check(
  "nothing on the page paints itself with the pass, fail or drift colours",
  paintedTokens.used.length === 0,
  paintedTokens.used.join(", ").slice(0, 160),
);

// ── Keyboard, and the phone ─────────────────────────────────────────────────────────────────────
await page.keyboard.press("Tab");
const firstStop = await page.evaluate(() => {
  const active = document.activeElement as HTMLElement | null;
  return active ? `${active.tagName}:${(active.innerText || active.getAttribute("aria-label") || "").slice(0, 40)}` : "none";
});
check("Tab reaches something focusable rather than nothing", firstStop !== "none" && firstStop !== "BODY:", firstStop);

await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/legal/security");
await page.getByRole("heading", { level: 1 }).waitFor();
const overflow = await page.evaluate(() => ({
  scroll: document.documentElement.scrollWidth,
  client: document.documentElement.clientWidth,
}));
check(
  "no horizontal overflow at 390px",
  overflow.scroll <= overflow.client + 1,
  `${overflow.scroll} vs ${overflow.client}`,
);
const phoneText = (await page.locator("main").innerText()).replace(/\s+/g, " ");
check("the guidance is still there on a phone", phoneText.includes("Set a spending limit on that key at your provider"));
await shoot(page, "legal-security-390");

// ── A real person, made through the product's own sign-in, so the row is a real row ─────────────
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto("/sign-in?next=%2Fapp%2Fprojects");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send sign-in link" }).click();
await page.getByRole("status").waitFor();
const token = psql(
  `select identifier from verifications where value::jsonb ->> 'email' = '${email}' order by created_at desc limit 1;`,
);
await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
await page.waitForURL(/\/app\/projects/);
const decline = page.getByRole("button", { name: "Decline" });
if (await decline.isVisible().catch(() => false)) await decline.click();
await shoot(page, "signed-in");

const owner = psql(`select id from users where email = '${email}';`);
// `owner.startsWith("")` was the first version of this line and is true of every string, empty
// included — the assertion has to be about the id actually being one.
check("the drive has a real user row to bind a key to", /^[A-Za-z0-9_-]{8,}$/.test(owner), owner ? "found" : "missing");

// ── The store, and then the dump. This is the half no unit test can make honestly ───────────────
const master = generateMasterKey();
const env = { KEY_ENCRYPTION_SECRET: master.secret };
const db = createDb(DATABASE_URL);

const stored = await putProviderKey(db, { owner, provider: "anthropic", plaintext: DRIVE_KEY, env });
check("a key is stored, and only its last four are kept in the open", stored.lastFour === DRIVE_KEY.slice(-4), stored.lastFour);
check("it opens again to exactly what went in", (await openStoredProviderKey(db, owner, "anthropic", env)) === DRIVE_KEY);

const metadata = await providerKeyMetadata(db, owner);
check("metadata carries no envelope for a page to render by accident", !Object.keys(metadata[0] ?? {}).includes("sealed"));

const sealed = psql(`select sealed from provider_keys where owner = '${owner}';`);
check("the row holds a versioned envelope", sealed.startsWith("41pk1."), sealed.slice(0, 20));

// **The real `pg_dump`**, inside the container that has it, exactly as `infra/backup.sh` would run it.
const dump = execFileSync(
  "docker",
  ["exec", "-i", CONTAINER, "pg_dump", "-U", "41p", "-d", "41p", "--data-only", "--table=provider_keys"],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
// The positive control first: an assertion that the key is absent is worthless if the dump is empty.
check("the dump actually contains the row", dump.includes(sealed), `${dump.length} bytes`);
check("the dump contains no plaintext key", !dump.includes(DRIVE_KEY));
check("the dump contains no recognisable fragment of one", !dump.includes(DRIVE_KEY.slice(-8)));
check("the dump contains no master key", !dump.includes(master.secret));

const wholeDump = execFileSync("docker", ["exec", "-i", CONTAINER, "pg_dump", "-U", "41p", "-d", "41p"], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
check(
  "a dump of the whole database contains no plaintext key either",
  !wholeDump.includes(DRIVE_KEY) && !wholeDump.includes(master.secret),
  `${Math.round(wholeDump.length / 1024)} KiB`,
);

// ── Only now, with every assertion made, is the test data removed ───────────────────────────────
cleanup();
const survivors = psql(`select count(*) from provider_keys where owner = '${owner}';`);
check("deleting the person deletes their key with them", survivors === "0", survivors);

await browser.close();

console.log(fail.length === 0 ? "\nDRIVE PASSED\n" : `\nDRIVE FAILED — ${fail.length}: ${fail.join(", ")}\n`);
process.exit(fail.length === 0 ? 0 : 1);
