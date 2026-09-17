/**
 * EPIC-054's drive: the BUILT app on localhost, and a REAL Python interpreter resolving from it.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web --filter=@41prompts/cli
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3117)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/54.env
 *   set -a && . /tmp/54.env && set +a
 *   pnpm --filter @41prompts/web start --port 3117 &
 *   npx tsx scripts/drive-epic-054.mts
 *
 * ## What makes this drive different from EPIC-053's
 *
 * 053 drove the CLI. This drives the **runtime the CLI generates a file for**, which is the only
 * way to find out whether the two halves meet: `41p pull --lang python` writes `prompts.py`, that
 * file imports `fortyone`, and `fortyone` fetches `/v1` from the server this repository just built.
 * Nothing in either test suite crosses that seam — the Python suite injects a transport and the
 * CLI's suite injects a `fetch`, so a mismatch between what the server serves and what the runtime
 * reads is invisible to both. Here a real interpreter makes real requests to a real Next server
 * holding a real published build.
 *
 * ## It runs the packed binary, and the Python from source on PYTHONPATH
 *
 * `scripts/pack-41p.mjs` assembles the tree npm would install — running `tsx src/bin.ts` would be
 * `docs/PROCESS.md`'s twenty-epic failure in a new costume. The Python side is the source tree on
 * `PYTHONPATH` rather than an installed wheel, and the drive **asserts which file it loaded**, so
 * "it worked" cannot quietly mean "it imported something else".
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik, migrations against the real database, and PyPI
 * — nothing is published, and `fortyone-prompts` has no registered name because EPIC-006 is
 * deferred. Nothing is pushed (`CLAUDE.md`), so nothing deploys, and the report says so in its own
 * numbered section.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and every piece of data built through the
 * product's own UI.
 */
import { chromium, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3117";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = join(ROOT, "sdks", "python");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-054");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-054-${Date.now()}@example.com`;

const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/** Everything the terminal said, kept so the report can quote a real transcript. */
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
async function publish(page: Page, promptId: string, reason: string, was = ""): Promise<string> {
  await page.goto(`${BASE}/app/pr/${promptId}/deploy`);
  const clean = page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ });
  if (await clean.isVisible().catch(() => false)) {
    await clean.click();
  } else {
    await page.getByRole("button", { name: "Publish anyway" }).click();
    await page.getByLabel(/Say why this is going Live/).fill(reason);
    await page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ }).click();
  }
  // Wait for the version to CHANGE, not to appear — EPIC-053's lesson 23. After the first publish
  // the Live card is already on screen, so waiting for visibility returns the old text instantly.
  const version = page.locator(".deploy-env-live .deploy-env-version");
  if (was === "") {
    await version.waitFor({ state: "visible", timeout: 15_000 });
  } else {
    await version.filter({ hasNotText: was }).waitFor({ state: "visible", timeout: 15_000 });
  }
  return (await version.textContent())?.trim() ?? "";
}

console.log(`cleaned up ${await deleteDriveUsers()} leftover drive account(s) before starting`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/** The scratch repository everything is driven in — a developer's project, not ours. */
const work = mkdtempSync(join(tmpdir(), "41p-drive-054-"));
const repo = join(work, "myapp");
mkdirSync(repo, { recursive: true });

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

  await page.getByLabel("New project").fill(`Drive 054 ${Date.now()}`);
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
  await page.getByLabel(/^Name for a new key/).fill("drive-054");
  await page.getByRole("button", { name: "New key" }).click();
  await page.getByTestId("minted-key").waitFor({ state: "visible", timeout: 15_000 });
  const KEY = (await page.getByTestId("minted-key").textContent())!.trim();
  record(
    "a key was minted through the keys page",
    /^41p_live_[0-9a-f]{32}$/.test(KEY),
    `41p_live_…${KEY.slice(-4)} — minted by clicking`,
  );

  // ── 2. `41p pull --lang python`, from the packed binary ────────────────────────────────────────

  const bin = execFileSync("node", [join(ROOT, "scripts", "pack-41p.mjs"), "--quiet", "--out", join(work, "packed")], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();

  const cli = (args: readonly string[]): { code: number; stdout: string; stderr: string } => {
    const env = { ...process.env, FORTYONE_BASE_URL: BASE, FORTYONE_API_KEY: KEY } as NodeJS.ProcessEnv;
    const done = spawnSync("node", [bin, ...args], { cwd: repo, encoding: "utf8", env });
    const stdout = done.stdout ?? "";
    const stderr = done.stderr ?? "";
    transcript.push(`$ 41p ${args.join(" ")}   # exit ${done.status}\n${stdout}${stderr}`);
    return { code: done.status ?? -1, stdout, stderr };
  };

  const pulled = cli(["pull", "--lang", "python"]);
  const generated = readFileSync(join(repo, "prompts.py"), "utf8");
  record(
    "41p pull --lang python writes prompts.py, the lockfile and the builds",
    pulled.code === 0 && generated.includes(`resolve("${promptId}"`),
    `prompts.py, 41p.lock.json, 41p/builds/`,
  );
  record(
    "and it now names the runtime to install rather than saying there is none",
    pulled.stdout.includes("pip install fortyone-prompts") && !pulled.stdout.includes("returns unavailable"),
    // Ruling 10. EPIC-053's sentence was true when written and false from this epic's merge.
    `stdout says ${JSON.stringify(pulled.stdout.split("\n").filter((l) => l.includes("pip install"))[0]?.trim() ?? "")}`,
  );
  writeFileSync(join(SHOTS, "generated-prompts.py.txt"), generated);

  // ── 3. A real interpreter, resolving the real published prompt over HTTP ───────────────────────

  const python = (source: string, extra: Record<string, string> = {}) => {
    const file = join(repo, "drive.py");
    writeFileSync(file, source);
    const done = spawnSync("python3", [file], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: PY, FORTYONE_API_KEY: KEY, FORTYONE_BASE_URL: BASE, ...extra },
    });
    const stdout = done.stdout ?? "";
    const stderr = done.stderr ?? "";
    transcript.push(`$ python3 drive.py   # exit ${done.status}\n${stdout}${stderr}`);
    return { code: done.status ?? -1, stdout, stderr };
  };

  const cold = python(
    [
      "import fortyone, json, os",
      "print('MODULE', fortyone.__file__)",
      "client = fortyone.create_client(cache_dir=os.path.join(os.getcwd(), '.cache'))",
      // Naming the prompt. A bare `refresh()` refreshes what has been asked for, and a client that
      // has just been built has been asked for nothing — which is what the first run of this drive
      // discovered, in this SDK and in the TypeScript one it was ported from.
      `client.refresh(${JSON.stringify(promptId)})`,
      `r = client.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
      "print('RESULT', json.dumps({'status': r.status, 'version': r.version, 'source': r.source,",
      "      'build_hash': r.build_hash, 'model': r.model, 'text': r.text}))",
      "client.close()",
      "",
    ].join("\n"),
  );
  const resolved = JSON.parse(cold.stdout.split("RESULT ")[1] ?? "{}") as Record<string, unknown>;
  record(
    "the module that ran is this repository's, not something else on the path",
    cold.stdout.includes(join(PY, "fortyone", "__init__.py")),
    // Without this, "it worked" could mean an installed wheel from another project answered.
    `loaded ${cold.stdout.split("MODULE ")[1]?.split("\n")[0] ?? "(nothing)"}`,
  );
  record(
    "a real Python process resolved the prompt published two minutes ago",
    resolved["status"] === "ok" && String(resolved["text"]).includes("Ada"),
    `status=${String(resolved["status"])} version=${String(resolved["version"])} model=${String(resolved["model"])}`,
  );
  record(
    "and the build it verified is the one the browser published",
    typeof resolved["build_hash"] === "string" && (resolved["build_hash"] as string).length === 64,
    // The content address it re-derived here agrees with the one `packages/core` wrote server-side.
    `buildHash ${String(resolved["build_hash"]).slice(0, 16)}…`,
  );
  record(
    "the prompt it produced is the compiled text with the variable bound",
    String(resolved["text"]).includes("Northwind") && !String(resolved["text"]).includes("{{"),
    `no unbound braces remain`,
  );

  // The generated file, called the way its own signature says to.
  //
  // It calls the **module-level** `resolve()`, whose client is built on first use and is therefore
  // cold — so the very first call in a fresh process returns `unavailable`, which is rule 8's
  // stated cost and not a defect. `configure(bundled=…)` is the answer, and what `41p pull` writes
  // `41p/builds/` for. Both halves are asserted, because a drive that only showed the working one
  // would be hiding the thing a customer meets first.
  const coldBindings = python(
    [
      "from prompts import refund_classifier",
      "r = refund_classifier(customer_name='Ada')",
      "print('STATUS', r.status)",
      "",
    ].join("\n"),
  );
  record(
    "the generated file's first call in a cold process is unavailable, as rule 8 says it is",
    coldBindings.code === 0 && coldBindings.stdout.includes("STATUS unavailable"),
    // Asserted rather than discovered. `configure` is the next check and is the documented answer.
    `refund_classifier(customer_name='Ada') → ${coldBindings.stdout.split("STATUS ")[1]?.split("\n")[0] ?? "?"}`,
  );

  const viaBindings = python(
    [
      "import fortyone, glob, json, pathlib",
      "# The pairing `41p pull` exists for: it wrote both of these files.",
      "docs = [json.loads(pathlib.Path(p).read_text()) for p in glob.glob('41p/builds/*.json')]",
      "fortyone.configure(bundled=docs)",
      "from prompts import refund_classifier",
      "r = refund_classifier(customer_name='Ada')",
      "print('STATUS', r.status)",
      "print('TEXT', r.text.replace(chr(10), ' | '))",
      "",
    ].join("\n"),
  );
  record(
    "and with configure(bundled=…) it answers on its first call, in one cold process",
    viaBindings.code === 0 && viaBindings.stdout.includes("STATUS ok") && viaBindings.stdout.includes("Ada"),
    // The seam neither test suite crosses: generated code, real runtime, real server's build.
    `configure(bundled=41p/builds/*) → refund_classifier(customer_name='Ada') → ok`,
  );

  const typeChecked = spawnSync(
    "uv",
    ["run", "--with", "mypy", "--project", PY, "mypy", "--strict", join(repo, "prompts.py")],
    { cwd: PY, encoding: "utf8", env: { ...process.env, MYPYPATH: PY } },
  );
  transcript.push(`$ mypy --strict prompts.py   # exit ${typeChecked.status}\n${typeChecked.stdout ?? ""}`);
  record(
    "the generated file passes mypy --strict against the real runtime",
    typeChecked.status === 0,
    (typeChecked.stdout ?? "").trim().split("\n").slice(-1)[0] ?? "",
  );

  // ── 4. Offline: the answer when we are unreachable ─────────────────────────────────────────────

  const offline = python(
    [
      "import fortyone, json, os",
      "warnings = []",
      "client = fortyone.create_client(base_url='http://127.0.0.1:1', cache_dir=os.path.join(os.getcwd(), '.cache'),",
      "                                on_warning=warnings.append)",
      `r = client.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
      "print('RESULT', json.dumps({'status': r.status, 'source': r.source, 'version': r.version}))",
      "client.close()",
      "",
    ].join("\n"),
  );
  const fromCache = JSON.parse(offline.stdout.split("RESULT ")[1] ?? "{}") as Record<string, unknown>;
  record(
    "with the server unreachable it answers from the disk cache the first run wrote",
    fromCache["status"] === "ok" && fromCache["source"] === "disk",
    // The restart case: a fresh process, a warm directory, nothing listening.
    `status=${String(fromCache["status"])} source=${String(fromCache["source"])}`,
  );

  const bundled = python(
    [
      "import fortyone, glob, json, pathlib",
      "docs = [json.loads(pathlib.Path(p).read_text()) for p in glob.glob('41p/builds/*.json')]",
      "client = fortyone.create_client(api_key=None, base_url='http://127.0.0.1:1', cache_dir=None, bundled=docs,",
      "                                on_warning=lambda w: None)",
      `r = client.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
      "print('RESULT', json.dumps({'status': r.status, 'source': r.source, 'count': len(docs)}))",
      "client.close()",
      "",
    ].join("\n"),
  );
  const fromBundle = JSON.parse(bundled.stdout.split("RESULT ")[1] ?? "{}") as Record<string, unknown>;
  record(
    "and from what 41p pull bundled, with no key, no cache and nothing listening",
    fromBundle["status"] === "ok" && fromBundle["source"] === "bundled",
    `${String(fromBundle["count"])} build(s) from 41p/builds/ — the cold-start answer`,
  );

  // ── 5. Publish again in the browser, and watch a running process pick it up ────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}`);
  await addBlok(page, "constraint", "Never promise a refund date.");
  const secondLive = await publish(page, promptId, "adding the refund-date rule for support", live);
  record("a second version is Live", /^Live v\d+$/.test(secondLive), `Deploy says ${secondLive}`);

  const picked = python(
    [
      "import fortyone, json, os",
      "client = fortyone.create_client(cache_dir=os.path.join(os.getcwd(), '.cache2'))",
      `client.refresh(${JSON.stringify(promptId)})`,
      `first = client.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
      `client.refresh(${JSON.stringify(promptId)})  # as the background timer would have done`,
      `again = client.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
      "print('RESULT', json.dumps({'version': again.version, 'has_rule': 'refund date' in again.text,",
      "      'first': first.version}))",
      "client.close()",
      "",
    ].join("\n"),
  );
  const after = JSON.parse(picked.stdout.split("RESULT ")[1] ?? "{}") as Record<string, unknown>;
  record(
    "a Python process reads the new version without a redeploy",
    after["has_rule"] === true && Number(after["version"]) > 1,
    `Live ${secondLive} → resolve() returned v${String(after["version"])} carrying the new constraint`,
  );

  // ── 6. The screenshots ─────────────────────────────────────────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}/deploy`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "01-deploy-live-v2-1440.png"), fullPage: true });
  await page.goto(`${BASE}/app/p/${projectId}/connect`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "02-connect-1440.png"), fullPage: true });

  writeFileSync(join(SHOTS, "terminal-transcript.txt"), transcript.join("\n"));
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) afterwards`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length === 0 ? 0 : 1);
