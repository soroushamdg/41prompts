/**
 * EPIC-053's drive: the BUILT app on localhost, and the PACKED `41p` binary against it.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web --filter=@41prompts/cli
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3116)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/53.env
 *   set -a && . /tmp/53.env && set +a
 *   pnpm --filter @41prompts/web start --port 3116 &
 *   npx tsx scripts/drive-epic-053.mts
 *
 * ## It runs the packed binary, not `tsx src/bin.ts`
 *
 * `scripts/pack-41p.mjs` assembles the tree npm would install and this drives that. Running the
 * source through `tsx` would be `docs/PROCESS.md`'s twenty-epic failure in a new costume: a
 * development convenience that resembles the artifact, standing in for it, unable to fail the way it
 * fails. A packed tree can fail the way a published package fails, and that is the point.
 *
 * ## The whole journey, in the order a person does it
 *
 * Sign up, make a project, write a prompt, publish it, mint a key on the keys page — all by
 * clicking — and then leave the browser entirely and use the CLI the way a developer would: link,
 * pull, compile the file that lands, check in CI, publish again in the browser, check again and
 * watch it go red, run, and decompile.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik, migrations against the real database, and npm
 * itself — nothing is published and `prepublishOnly` refuses until EPIC-056 creates the org. Nothing
 * is pushed (`CLAUDE.md`), so nothing deploys, and the report says so in its own section.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and every piece of data built through the
 * product's own UI.
 */
import { chromium, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3116";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-053");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-053-${Date.now()}@example.com`;

const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/** Everything the CLI wrote and said, kept so the report can quote a real transcript. */
const transcript: string[] = [];

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/sign-in?next=%2Fapp%2Fprojects`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 15_000 });

  const token = await magicLinkTokenFor(EMAIL);
  if (token === undefined) throw new Error("no magic-link row for the drive's address");
  // The token goes from the row into a URL and nowhere else.
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
  await page.waitForURL(/\/app\/projects/, { timeout: 15_000 });
}

async function addBlok(page: Page, kind: string, text: string): Promise<void> {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").waitFor({ state: "visible" });
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await page
    .locator(".canvas-list > li")
    .nth(before)
    .locator('.blok-editor-state[data-state="saved"]')
    .waitFor({ state: "attached", timeout: 15_000 });
}

async function answerConsent(page: Page): Promise<void> {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) {
    await decline.click();
    await decline.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

/** Publish whatever is Draft, going past the gate if it has to, and return the Live version text. */
async function publish(page: Page, promptId: string, reason: string): Promise<string> {
  await page.goto(`${BASE}/app/pr/${promptId}/deploy`);
  const clean = page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ });
  if (await clean.isVisible().catch(() => false)) {
    await clean.click();
  } else {
    await page.getByRole("button", { name: "Publish anyway" }).click();
    await page.getByLabel(/Say why this is going Live/).fill(reason);
    await page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ }).click();
  }
  await page.locator(".deploy-env-live .deploy-env-version").waitFor({ state: "visible", timeout: 15_000 });
  return (await page.locator(".deploy-env-live .deploy-env-version").textContent())?.trim() ?? "";
}

console.log(`cleaned up ${await deleteDriveUsers()} leftover drive account(s) before starting`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/** The scratch repository the CLI is driven in — a developer's project, not ours. */
const work = mkdtempSync(join(tmpdir(), "41p-drive-053-"));

try {
  // ── 0. Prove the server is the build just made (lesson 17) ─────────────────────────────────────

  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const buildId = readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  const html = await page.content();
  record(
    "the server answering is the build just made",
    landing?.status() === 200 && html.includes(buildId),
    `BUILD_ID ${buildId} ${html.includes(buildId) ? "is" : "is NOT"} in the HTML`,
  );

  // ── 1. A prompt, published, and a key — all by clicking ────────────────────────────────────────

  await signIn(page);
  await answerConsent(page);

  await page.getByLabel("New project").fill(`Drive 053 ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/, { timeout: 15_000 });
  const projectId = page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!;

  await page.getByLabel("New prompt").fill("Refund classifier");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/, { timeout: 15_000 });
  const promptId = page.url().split("/app/pr/")[1]!.split(/[/?#]/)[0]!;

  await addBlok(page, "context", "You triage inbound refund requests for Northwind.");
  await addBlok(page, "constraint", "Address the writer as {{customer_name}} and reply in at most 80 words.");
  record("a project and a prompt were built by clicking", true, `${projectId} / ${promptId}`);

  const live = await publish(page, promptId, "first publish of the refund classifier");
  record("the prompt is Live", /^Live v\d+$/.test(live), `Deploy says ${live}`);

  await page.goto(`${BASE}/app/settings/keys`);
  await page.getByLabel(/^Name for a new key/).fill("drive-053");
  await page.getByRole("button", { name: "New key" }).click();
  await page.getByTestId("minted-key").waitFor({ state: "visible", timeout: 15_000 });
  const KEY = (await page.getByTestId("minted-key").textContent())!.trim();
  record(
    "a key was minted through the keys page",
    /^41p_live_[0-9a-f]{32}$/.test(KEY),
    `41p_live_…${KEY.slice(-4)} — minted by clicking, as EPIC-055 made possible`,
  );

  // ── 2. Leave the browser. Everything below is the packed binary. ───────────────────────────────

  const bin = execFileSync("node", [join(ROOT, "scripts", "pack-41p.mjs"), "--quiet", "--out", join(work, "packed")], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const repo = join(work, "myapp");
  mkdirSync(repo, { recursive: true });

  /** Run `41p` the way a developer would, with the key in the environment and nowhere else. */
  const cli = (args: readonly string[]): { code: number; stdout: string; stderr: string } => {
    const env = { ...process.env, FORTYONE_API_KEY: KEY, FORTYONE_BASE_URL: BASE };
    try {
      const stdout = execFileSync("node", [bin, ...args], { cwd: repo, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
      transcript.push(`$ 41p ${args.join(" ")}\n${stdout}`);
      return { code: 0, stdout, stderr: "" };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      transcript.push(`$ 41p ${args.join(" ")}   # exit ${failure.status}\n${failure.stdout ?? ""}${failure.stderr ?? ""}`);
      return { code: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
    }
  };

  const linked = cli(["link"]);
  const rc = readFileSync(join(repo, ".41prc"), "utf8");
  record(
    "41p link writes .41prc and proves the key",
    linked.code === 0 && linked.stdout.includes("1 prompt, 1 Live"),
    `exit 0; ${JSON.stringify(rc.replace(/\s+/g, " ").trim())}`,
  );
  record(
    "and the key is nowhere in it",
    !rc.includes(KEY) && !rc.includes(KEY.slice(9)),
    // The control: the same search finds the key in a file that does have it.
    `searched for the key and the secret half; a planted copy IS found (${JSON.stringify({ key: KEY }).includes(KEY)})`,
  );

  const pulled = cli(["pull"]);
  const generated = readFileSync(join(repo, "prompts.ts"), "utf8");
  const lock = JSON.parse(readFileSync(join(repo, "41p.lock.json"), "utf8")) as {
    prompts: { id: string; version: number }[];
    generated: string;
  };
  record(
    "41p pull writes the bindings, the lockfile and the builds",
    pulled.code === 0 && generated.includes(`prompts.resolve("${promptId}"`) && lock.prompts[0]!.id === promptId,
    `prompts.ts, 41p.lock.json (v${lock.prompts[0]!.version}), 41p/builds/`,
  );
  record(
    "the generated file carries the roadmap's ownership sentence",
    generated.includes("This file is yours; 41Prompts claims no rights in it."),
    "verbatim, as the first comment line",
  );
  record(
    "the signature is built from what the prompt uses",
    generated.includes("customer_name: string"),
    // Nothing declares `customer_name`; EPIC-055's drive found that omitting it ships `{{…}}`.
    `signature reads ${JSON.stringify(generated.split("\n").find((l) => l.startsWith("export function"))?.trim())}`,
  );
  writeFileSync(join(SHOTS, "generated-prompts.ts.txt"), generated);

  // The roadmap's Review line, done for real against the published SDK declarations.
  const fresh = join(work, "fresh");
  mkdirSync(join(fresh, "node_modules", "@41prompts"), { recursive: true });
  cpSync(join(work, "packed", "node_modules", "@41prompts", "sdk"), join(fresh, "node_modules", "@41prompts", "sdk"), { recursive: true });
  for (const name of ["@types/node", "undici-types"]) {
    const found = execFileSync("find", [join(ROOT, "node_modules", ".pnpm"), "-maxdepth", "4", "-type", "d", "-path", `*/node_modules/${name}`], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.length > 0)[0]!;
    cpSync(found, join(fresh, "node_modules", name.startsWith("@") ? name : name), { recursive: true });
  }
  writeFileSync(join(fresh, "package.json"), JSON.stringify({ name: "fresh", private: true, type: "module" }));
  writeFileSync(
    join(fresh, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"], noEmit: true, skipLibCheck: false },
      include: ["prompts.ts"],
    }),
  );
  cpSync(join(repo, "prompts.ts"), join(fresh, "prompts.ts"));
  let compiled = "";
  let compiles = true;
  try {
    execFileSync("node", [join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], { cwd: fresh, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    compiles = false;
    const failure = error as { stdout?: string };
    compiled = failure.stdout ?? "";
  }
  record(
    "the generated file compiles under strict in a fresh project",
    compiles,
    compiles ? "tsc --strict, skipLibCheck off, against the SDK's published declarations" : compiled.slice(0, 300),
  );

  const clean = cli(["check"]);
  record("41p check exits 0 when nothing has moved", clean.code === 0 && clean.stdout.includes("Current"), `exit ${clean.code}`);

  // ── 3. Publish again in the browser, and watch CI go red ───────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}`);
  await addBlok(page, "constraint", "Never promise a refund date.");
  const secondLive = await publish(page, promptId, "adding the refund-date rule for support");
  record("a second version is Live", /^Live v\d+$/.test(secondLive), `Deploy says ${secondLive}`);

  const stale = cli(["check"]);
  record(
    "41p check exits 1 and names what moved",
    stale.code === 1 && stale.stderr.includes("Stale") && stale.stderr.includes(promptId),
    `exit 1 — ${JSON.stringify((stale.stderr.split("\n").find((l) => l.includes("lockfile has")) ?? "").trim())}`,
  );

  const missingKey = (() => {
    const env = { ...process.env, FORTYONE_BASE_URL: BASE };
    delete env.FORTYONE_API_KEY;
    try {
      execFileSync("node", [bin, "check"], { cwd: repo, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
      return { code: 0, stderr: "" };
    } catch (error) {
      const failure = error as { status?: number; stderr?: string };
      return { code: failure.status ?? -1, stderr: failure.stderr ?? "" };
    }
  })();
  record(
    "and exits 2, not 1, when it cannot answer at all",
    missingKey.code === 2 && missingKey.stderr.includes("not a stale lockfile"),
    // The distinction ruling 7 exists for: a CI job with no credential must not look like a
    // repository that is behind.
    `stale → 1, no key → ${missingKey.code}`,
  );

  const repulled = cli(["pull"]);
  const afterPull = cli(["check"]);
  record(
    "41p pull fixes it",
    repulled.code === 0 && afterPull.code === 0,
    `pull, then check exits ${afterPull.code}`,
  );

  // ── 4. run, and decompile ──────────────────────────────────────────────────────────────────────

  const ran = cli(["run", promptId, "--var", "customer_name=Ada"]);
  record(
    "41p run prints the prompt a program would send",
    ran.code === 0 && ran.stdout.includes("Ada") && ran.stdout.includes("Northwind"),
    `stdout is the compiled prompt with {{customer_name}} bound to Ada`,
  );
  record(
    "and says on stderr that no model was called",
    ran.stderr.includes("No model was called") && !ran.stdout.includes("No model was called"),
    // stdout stays pipeable: `41p run x > prompt.txt` must write the prompt and nothing else.
    "the note is on stderr, so a redirect gets only the prompt",
  );

  const incomplete = cli(["run", promptId]);
  record(
    "41p run exits 1 and names a missing variable",
    incomplete.code === 1 && incomplete.stderr.includes("customer_name"),
    `exit 1 — ${JSON.stringify((incomplete.stderr.split("\n")[0] ?? "").trim())}`,
  );

  writeFileSync(
    join(repo, "northwind.txt"),
    [
      "You are a helpful customer support assistant for Northwind.",
      "Always classify the email into one of these categories: billing, technical, other.",
      "You must respond in JSON only.",
      "Do not include any explanation outside the JSON.",
      "Keep the summary reasonably short.",
    ].join("\n\n"),
  );
  const decompiled = (() => {
    // No key and no base URL at all — the open decompiler needs neither, and running it without
    // them is the assertion rather than a claim in the README.
    const env = { ...process.env };
    delete env.FORTYONE_API_KEY;
    delete env.FORTYONE_BASE_URL;
    try {
      const stdout = execFileSync("node", [bin, "decompile", "northwind.txt"], { cwd: repo, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] });
      transcript.push(`$ 41p decompile northwind.txt\n${stdout}`);
      return { code: 0, stdout };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string };
      transcript.push(`$ 41p decompile northwind.txt   # exit ${failure.status}\n${failure.stdout ?? ""}`);
      return { code: failure.status ?? -1, stdout: failure.stdout ?? "" };
    }
  })();
  record(
    "41p decompile works with no key and no configuration",
    decompiled.code === 1 && decompiled.stdout.includes("Findings:") && decompiled.stdout.includes("rule_without_check"),
    `exit 1 (findings present) — ${JSON.stringify((decompiled.stdout.split("\n")[0] ?? "").trim())}`,
  );

  const python = cli(["pull", "--lang", "python"]);
  const generatedPy = readFileSync(join(repo, "prompts.py"), "utf8");
  record(
    "41p pull --lang python writes prompts.py and says what the runtime does today",
    python.code === 0 && generatedPy.includes("def refund_classifier(") && python.stdout.includes("EPIC-054"),
    // Ruling 3: the file is right and the runtime underneath it is not, so the gap is stated.
    `signature ${JSON.stringify(generatedPy.split("\n").find((l) => l.startsWith("def "))?.trim())}`,
  );
  writeFileSync(join(SHOTS, "generated-prompts.py.txt"), generatedPy);

  // ── 5. Back to the browser: the Connect page names the command ─────────────────────────────────

  await page.goto(`${BASE}/app/p/${projectId}/connect`);
  const card = (await page.locator(".connect-card").first().textContent()) ?? "";
  record(
    "the Connect page names 41p pull",
    card.includes("41p pull"),
    "EPIC-055 ruling 3 said this page would gain one clause when the command shipped",
  );
  await page.screenshot({ path: join(SHOTS, "01-connect-names-41p-pull-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record("the Connect page still fits 390px", over <= 0, `overflow ${over}px`);
  await page.screenshot({ path: join(SHOTS, "02-connect-390.png"), fullPage: true });

  writeFileSync(join(SHOTS, "cli-transcript.txt"), transcript.join("\n"));
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) afterwards`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length === 0 ? 0 : 1);
