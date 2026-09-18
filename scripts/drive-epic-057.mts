/**
 * EPIC-057's drive: the BUILT app on localhost, three mitigations exercised against it.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web --filter=@41prompts/sdk
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3117)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/57.env
 *   set -a && . /tmp/57.env && set +a
 *   pnpm --filter @41prompts/web start --port 3117 &
 *   npx tsx scripts/drive-epic-057.mts
 *
 * ## What this drive is for
 *
 * EPIC-057 is a threat model, and a threat model whose mitigations were never exercised against a
 * running system is a document. Three of its findings have code behind them, and each is checked
 * here against the built app over real HTTP:
 *
 * 1. **The marker endpoint is rate limited** (finding 5). Driven past the unauthenticated budget
 *    until it answers `429` with a `Retry-After`, and — the property that matters — an authenticated
 *    caller from **that same address** is still served. Ruling 12 exists because the first version of
 *    this limiter would have failed that second check, and asking how this drive would demonstrate
 *    the limit is what found it.
 * 2. **A substituted build is refused** (finding 3). A real `@41prompts/sdk` client resolves the
 *    prompt the browser just published, then one byte of the stored row is changed and the same
 *    client refuses it with `hash_mismatch` while continuing to serve what it already proved.
 * 3. **A cache directory other users can write is refused** (finding 3's mitigation). A real Python
 *    interpreter, `chmod 0777` on the cache directory, and `fortyone` declining to read it — with
 *    the control that the identical directory at `0700` is used.
 *
 * ## The order is the assertion, twice
 *
 * The unlimited path is asserted **before** the bucket is deliberately exhausted, and the untampered
 * build **before** the row is changed. A drive that tampered first could not tell a mitigation from
 * a broken server — `HANDOVER.md` lesson 12: a fixture where everything fails cannot show a
 * difference either.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik, migrations against the real database, and the
 * CDN — there is no R2 bucket, so the bytes come from `/v1/blob` and the redirect being followed is
 * same-origin. Nothing is pushed (`CLAUDE.md`), so nothing deploys and no staging URL is evidence
 * about any of this. **And the key rate limit is not driven**: it is 20,000 an hour by design, which
 * is not a thing to send over a loopback socket for a screenshot; it is the same `checkLimit` with a
 * different constant and `v1-limits.test.ts` covers it.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and every piece of data built through the
 * product's own UI.
 */
import { chromium, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3117";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = join(ROOT, "sdks", "python");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-057");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-057-${Date.now()}@example.com`;

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
const work = mkdtempSync(join(tmpdir(), "41p-drive-057-"));

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

  await page.getByLabel("New project").fill(`Drive 057 ${Date.now()}`);
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
  await page.getByLabel(/^Name for a new key/).fill("drive-057");
  await page.getByRole("button", { name: "New key" }).click();
  await page.getByTestId("minted-key").waitFor({ state: "visible", timeout: 15_000 });
  const KEY = (await page.getByTestId("minted-key").textContent())!.trim();
  record(
    "a key was minted through the keys page",
    /^41p_live_[0-9a-f]{32}$/.test(KEY),
    `41p_live_…${KEY.slice(-4)} — minted by clicking`,
  );

  // ── 2. The marker endpoint is rate limited (finding 5) ─────────────────────────────────────────
  //
  // The UNAUTHENTICATED budget, because it is 60 an hour and therefore drivable; the key budget is
  // 20,000 by design and is the same `checkLimit` with a different constant.
  //
  // `x-forwarded-for` is what `clientAddress` reads, and it is what Traefik sets in front of the
  // real deployment. A fixed address per run so two runs of this drive do not share a bucket.
  const ADDRESS = `198.51.100.${(Date.now() % 200) + 1}`;
  const markerUrl = `${BASE}/v1/marker/${promptId}`;

  const ask = async (headers: Record<string, string>) => {
    const response = await fetch(markerUrl, { headers, redirect: "manual" });
    return { status: response.status, retryAfter: response.headers.get("retry-after") };
  };

  // Before anything is exhausted: a request with no key is refused for the honest reason, 401.
  const firstAnonymous = await ask({ "x-forwarded-for": ADDRESS });
  record(
    "an unauthenticated request is 401 while the budget lasts, not 429",
    firstAnonymous.status === 401,
    `first request from ${ADDRESS} answered ${firstAnonymous.status}`,
  );

  // Spend the rest of the budget.
  let limited: { status: number; retryAfter: string | null } = firstAnonymous;
  let sent = 1;
  for (; sent <= 120 && limited.status !== 429; sent += 1) {
    limited = await ask({ "x-forwarded-for": ADDRESS });
  }
  record(
    "the marker endpoint answers 429 once the unauthenticated budget is gone",
    limited.status === 429 && limited.retryAfter !== null && Number(limited.retryAfter) > 0,
    `429 after ${sent} requests, Retry-After: ${limited.retryAfter ?? "(absent)"} seconds`,
  );

  // **The property ruling 12 exists for.** The same address, now refused for unauthenticated
  // requests, must still be served when it presents a real key — otherwise anybody could lock out a
  // customer's whole fleet by spending their shared egress address's budget.
  const authorisedFromSameAddress = await ask({
    "x-forwarded-for": ADDRESS,
    authorization: `Bearer ${KEY}`,
  });
  record(
    "an authenticated caller from that same address is still served — ruling 12",
    authorisedFromSameAddress.status === 302,
    `with the key, the same address answered ${authorisedFromSameAddress.status} (302 = redirect to the bytes)`,
  );

  // And a wrong key from that address is still 401 rather than 429 — the address bucket counts
  // failures, so this is the ceiling working rather than a gate in front of authentication.
  const wrongKey = await ask({
    "x-forwarded-for": `${ADDRESS}9`,
    authorization: "Bearer 41p_live_00000000000000000000000000000000",
  });
  record(
    "a well-formed wrong key is 401, on a fresh address",
    wrongKey.status === 401,
    `answered ${wrongKey.status}`,
  );

  transcript.push(
    [
      `# finding 5 — the marker endpoint, over real HTTP`,
      `GET /v1/marker/${promptId}            (no key, ${ADDRESS})  -> ${firstAnonymous.status}`,
      `... ${sent} unauthenticated requests later                  -> ${limited.status}, Retry-After: ${limited.retryAfter}`,
      `GET /v1/marker/${promptId}  Bearer …${KEY.slice(-4)} (${ADDRESS}) -> ${authorisedFromSameAddress.status}`,
      "",
    ].join("\n"),
  );

  // ── 3. A substituted build is refused (finding 3) ──────────────────────────────────────────────
  //
  // A real `@41prompts/sdk` client, in a separate node process so the SDK is the built `dist` rather
  // than this script's module graph — running `src` here would be the `next dev` failure in a new
  // costume (`HANDOVER.md` lesson 5 / PROCESS.md's dev-server rule).
  const sdkProbe = join(work, "probe.mjs");
  const node = (source: string) => {
    writeFileSync(sdkProbe, source);
    const done = spawnSync("node", [sdkProbe], { cwd: work, encoding: "utf8", env: { ...process.env } });
    transcript.push(`$ node probe.mjs   # exit ${done.status}\n${done.stdout ?? ""}${done.stderr ?? ""}`);
    return { code: done.status ?? -1, stdout: done.stdout ?? "", stderr: done.stderr ?? "" };
  };

  const probeSource = [
    `import { createClient } from ${JSON.stringify(join(ROOT, "packages/sdk-ts/dist/index.js"))};`,
    "const warnings = [];",
    "const client = createClient({",
    `  apiKey: ${JSON.stringify(KEY)},`,
    `  baseUrl: ${JSON.stringify(BASE)},`,
    `  cacheDir: null,`,
    "  onWarning: (warning) => warnings.push(warning),",
    "});",
    `await client.refresh(${JSON.stringify(promptId)});`,
    `const first = client.resolve(${JSON.stringify(promptId)}, { customer_name: "Ada" });`,
    // A second refresh and resolve in the same process. On the tampered run the first refresh has
    // already been refused, so this shows the client asking again rather than going quiet — and on
    // the clean run it shows a repeat costing nothing.
    `await client.refresh(${JSON.stringify(promptId)});`,
    `const second = client.resolve(${JSON.stringify(promptId)}, { customer_name: "Ada" });`,
    "console.log('RESULT', JSON.stringify({",
    "  first: { status: first.status, version: first.version, buildHash: first.buildHash, text: first.text },",
    "  second: { status: second.status, version: second.version, buildHash: second.buildHash, text: second.text },",
    "  warnings,",
    "}));",
    "client.close();",
    "",
  ].join("\n");

  // First: the untampered path, which is the control for everything below it.
  const clean = node(probeSource);
  const cleanResult = JSON.parse(clean.stdout.split("RESULT ")[1] ?? "{}") as Record<string, never>;
  record(
    "a real @41prompts/sdk client resolves the prompt the browser just published",
    (cleanResult["first"] as unknown as { status?: string })?.status === "ok" &&
      String((cleanResult["first"] as unknown as { text?: string })?.text).includes("Northwind") &&
      (cleanResult["warnings"] as unknown as unknown[])?.length === 0,
    `status ok, no warnings, text carries the context blok`,
  );
  const publishedHash = String((cleanResult["first"] as unknown as { buildHash?: string })?.buildHash ?? "");

  // Now change one byte of the stored build, in the same database the app is reading.
  //
  // Through `psql` in the **local** e2e container rather than through a module graph: this is the
  // one place the drive has to act as something other than a customer, and a statement is clearer
  // evidence than a script. `CLAUDE.md`'s server-access rules are about the staging box and do not
  // reach a throwaway container this drive started; nothing here touches staging or production.
  const psql = (statement: string) => {
    const done = spawnSync(
      "docker",
      ["exec", "-i", "41p-e2e-postgres", "psql", "-U", "41p", "-d", "41p", "-tAc", statement],
      { encoding: "utf8" },
    );
    transcript.push(`$ psql -tAc '${statement.slice(0, 90)}…'   # exit ${done.status}\n${done.stdout ?? ""}${done.stderr ?? ""}`);
    return (done.stdout ?? "").trim();
  };

  const key = `development/builds/${publishedHash}.json`;
  const beforeLength = psql(`select length(body) from published_artifacts where key = '${key}';`);
  psql(`update published_artifacts set body = replace(body, 'Northwind', 'Northwinc') where key = '${key}';`);
  const afterLength = psql(`select length(body) from published_artifacts where key = '${key}';`);
  record(
    "one byte of the stored build was changed, and only one",
    beforeLength !== "" && beforeLength === afterLength,
    `published_artifacts.body length ${beforeLength} → ${afterLength} (same length, one character)`,
  );

  const tampered = node(probeSource);
  const tamperedResult = JSON.parse(tampered.stdout.split("RESULT ")[1] ?? "{}") as Record<string, never>;
  const tamperedWarnings = (tamperedResult["warnings"] as unknown as { code: string; message: string }[]) ?? [];
  record(
    "the same client refuses the substituted build with hash_mismatch",
    tamperedWarnings.some((warning) => warning.code === "hash_mismatch"),
    tamperedWarnings.map((warning) => `${warning.code}: ${warning.message}`).join(" · ") || "(no warning at all)",
  );
  record(
    "and it does not hand the substituted text to the caller",
    (tamperedResult["first"] as unknown as { status?: string })?.status === "unavailable" &&
      !String((tamperedResult["first"] as unknown as { text?: string })?.text ?? "").includes("Northwinc"),
    `status ${String((tamperedResult["first"] as unknown as { status?: string })?.status)}, text does not contain the changed word`,
  );

  // Put it back, so the screenshots and the Python step are about a healthy system.
  psql(`update published_artifacts set body = replace(body, 'Northwinc', 'Northwind') where key = '${key}';`);
  const restored = node(probeSource);
  record(
    "restoring the byte restores the resolve — the control for the refusal",
    (JSON.parse(restored.stdout.split("RESULT ")[1] ?? "{}") as { first?: { status?: string } })?.first?.status === "ok",
    "the refusal was about the byte, not about the client or the server",
  );

  // ── 4. A cache directory other users can write is refused (finding 3's mitigation) ─────────────
  //
  // `fortyone`, in a real interpreter, because this is the SDK the mitigation shipped in — ruling 11
  // is why `@41prompts/sdk` does not have it.
  const python = (source: string) => {
    const file = join(work, "cache.py");
    writeFileSync(file, source);
    const done = spawnSync("python3", [file], {
      cwd: work,
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: PY, FORTYONE_API_KEY: KEY, FORTYONE_BASE_URL: BASE },
    });
    transcript.push(`$ python3 cache.py   # exit ${done.status}\n${done.stdout ?? ""}${done.stderr ?? ""}`);
    return { code: done.status ?? -1, stdout: done.stdout ?? "", stderr: done.stderr ?? "" };
  };

  const cacheDir = join(work, "cache");
  const cachePython = [
    "import fortyone, json, os, stat",
    "print('MODULE', fortyone.__file__)",
    "warnings = []",
    `cache = ${JSON.stringify(cacheDir)}`,
    "client = fortyone.create_client(cache_dir=cache, on_warning=warnings.append)",
    `client.refresh(${JSON.stringify(promptId)})`,
    `warm = client.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
    "client.close()",
    "mode = stat.S_IMODE(os.stat(cache).st_mode)",
    "# A second client, reading the cache the first one wrote, from disk rather than from memory.",
    "warnings2 = []",
    "c2 = fortyone.create_client(cache_dir=cache, on_warning=warnings2.append)",
    `cached = c2.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
    "c2.close()",
    "# Now make it writable by everybody, as a hostile local process would have on Linux, and read",
    "# again. Same directory, same file, same bytes.",
    "os.chmod(cache, 0o777)",
    "warnings3 = []",
    "c3 = fortyone.create_client(cache_dir=cache, on_warning=warnings3.append)",
    `refused = c3.resolve(${JSON.stringify(promptId)}, {'customer_name': 'Ada'})`,
    "c3.close()",
    "print('RESULT', json.dumps({",
    "  'created_mode': oct(mode),",
    "  'warm': warm.status,",
    "  'cached_status': cached.status, 'cached_source': cached.source,",
    "  'cached_warnings': [w.code for w in warnings2],",
    "  'refused_status': refused.status, 'refused_source': refused.source,",
    "  'refused_warnings': [{'code': w.code, 'message': w.message} for w in warnings3],",
    "}))",
    "",
  ].join("\n");

  const cacheRun = python(cachePython);
  const cache = JSON.parse(cacheRun.stdout.split("RESULT ")[1] ?? "{}") as Record<string, never>;
  record(
    "fortyone creates its cache directory owner-only",
    String(cache["created_mode"]) === "0o700",
    `mode ${String(cache["created_mode"])} (0o700 expected; the umask can only take bits away)`,
  );
  record(
    "a second process reads that cache from disk — the control",
    String(cache["cached_status"]) === "ok" &&
      String(cache["cached_source"]) === "disk" &&
      (cache["cached_warnings"] as unknown as string[])?.length === 0,
    `status ${String(cache["cached_status"])} from ${String(cache["cached_source"])}, no warning`,
  );
  const refusedWarnings = (cache["refused_warnings"] as unknown as { code: string; message: string }[]) ?? [];
  record(
    "and the same cache is refused once other users can write it",
    String(cache["refused_source"]) !== "disk" && refusedWarnings.some((warning) => warning.code === "disk"),
    `source ${String(cache["refused_source"])} · ${refusedWarnings.map((w) => w.message).join(" · ") || "(no warning)"}`,
  );
  record(
    "the refusal is a warning and never an exception — rule 8",
    cacheRun.code === 0,
    `python3 exited ${cacheRun.code}`,
  );
  // Put it back so the temp directory is not left world-writable for the rest of the run.
  chmodSync(cacheDir, 0o700);

  // ── 5. The screenshots ─────────────────────────────────────────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}/deploy`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "01-deploy-live-1440.png"), fullPage: true });
  await page.goto(`${BASE}/app/settings/keys`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "02-settings-keys-1440.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/app/pr/${promptId}/deploy`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "03-deploy-390.png"), fullPage: true });

  writeFileSync(join(SHOTS, "terminal-transcript.txt"), transcript.join("\n"));
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) afterwards`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
for (const f of failed) console.log(`  FAILED: ${f.name} — ${f.detail}`);
process.exit(failed.length === 0 ? 0 : 1);
