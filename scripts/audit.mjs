#!/usr/bin/env node
// The monthly dependency, licence and security audit — `docs/roadmap.md`'s EPIC-901 row, as one
// command: `pnpm audit-run`.
//
// ## The two ways a monthly check covers nothing
//
// 1. **Nobody runs it.** Five commands, four of which need an argument nobody remembers, is a
//    procedure rather than a check. `docs/PROCESS.md` already paid for this lesson on the e2e
//    container: "a gate nobody runs because it is slow covers nothing".
// 2. **It reports the same thing every month.** The first run of `gitleaks` on this repository
//    returns 13 findings and every one is a test fixture. Report them again in October and nobody
//    reads the output; report them again in November and the real one arrives into a list people
//    have learned to skim. A verdict that cannot change is not a verdict.
//
// So the baseline in `docs/security/audit-baseline.json` is not a convenience — it is the thing
// that makes the output mean something. A finding in it is silent; a finding not in it FAILS; and
// **a baseline entry that matches nothing also FAILS**, because a stale exemption is how a check
// quietly stops catching what it exists for (EPIC-072 shipped a one-way Lighthouse waiver, noticed,
// and made it two-way — `docs/decisions/AUTONOMOUS.md`, 2026-09-18).
//
// ## PARTIAL is `scripts/gates.mjs`'s word and means the same thing here
//
// `gitleaks` and `uv` are not on every machine. A check whose tool is missing reports **PARTIAL**
// and names the tool, because "the tool is not here" and "nothing was found" must never print the
// same line — that is the defect `gates.mjs`'s PARTIAL verdict was built for.
//
// ## This is deliberately not part of `node scripts/gates.mjs ci`
//
// That mode's whole claim is parity with CI, and CI runs neither `gitleaks` nor `pip-audit`. A mode
// that runs gates CI does not run diverges from CI exactly as much as one that prunes CI's list.
// The cadence here is a calendar, not a commit.
//
// ## Nothing here prints a secret
//
// `gitleaks` writes its report, unredacted, into a temp directory that is removed on the way out.
// A finding's identity is a SHA-256 of the matched text, truncated — so a fixture that moves stays
// accepted, and a value that CHANGES re-fires. The value itself never reaches stdout, the baseline
// or a report.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BASELINE_PATH = join(ROOT, "docs/security/audit-baseline.json");
const INVENTORY_PATH = join(ROOT, "docs/security/key-inventory.md");

const ESC = String.fromCharCode(27) + "[";
const bold = (s) => `${ESC}1m${s}${ESC}22m`;
const green = (s) => `${ESC}32m${s}${ESC}39m`;
const red = (s) => `${ESC}31m${s}${ESC}39m`;
const amber = (s) => `${ESC}33m${s}${ESC}39m`;
const plain = (s) => s.replace(new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, "g"), "");
const pad = (s, n) => s + " ".repeat(Math.max(0, n - plain(s).length));

const fingerprint = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf-8" }).status === 0;
const capture = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, ...opts });

// A check returns { status, note, findings }. `status` is only ever set here for "partial" — pass
// and fail are decided by the baseline comparison below, uniformly, so no check can accidentally
// call itself clean while holding findings.
const partial = (note) => ({ status: "partial", note, findings: [] });
const found = (findings, note = "") => ({ status: null, note, findings });

// --- 1. npm advisories ---------------------------------------------------------------------------

function npmAdvisories() {
  const res = capture("pnpm", ["audit", "--json"]);
  // `pnpm audit` exits non-zero when it finds something, which is not an error.
  let parsed;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    return partial(`pnpm audit produced no JSON (exit ${res.status}); ${(res.stderr || "").split("\n")[0]}`);
  }
  const advisories = Object.values(parsed.advisories ?? {});
  const total = parsed.metadata?.totalDependencies ?? "?";
  return found(
    advisories.map((a) => ({
      // The advisory id plus the package: one advisory can name several packages in one tree
      // (`vitest` and `@vitest/mocker` are one CVE), and each is accepted or not on its own.
      id: `${a.github_advisory_id ?? a.id}:${a.module_name}`,
      severity: a.severity,
      title: `${a.module_name}@${(a.findings ?? [])[0]?.version ?? "?"} — ${a.title}`,
      where: (a.findings ?? []).flatMap((f) => f.paths ?? []).slice(0, 3).join(" · "),
    })),
    `${total} dependencies`
  );
}

// --- 2. Python advisories ------------------------------------------------------------------------

function pythonAdvisories() {
  if (!has("uv")) return partial("uv is not installed — `brew install uv`");
  const dir = join(ROOT, "sdks/python");
  if (!existsSync(join(dir, "uv.lock"))) return partial("sdks/python/uv.lock is missing");

  const tmp = mkdtempSync(join(tmpdir(), "41p-audit-py-"));
  try {
    // `--no-emit-project` matters: the project itself exports as an editable requirement, and
    // pip-audit refuses an editable install alongside the hashes uv writes. The project has zero
    // dependencies of its own (`pyproject.toml`, asserted by tests/test_packaging.py), so nothing
    // is lost by leaving it out — what is being audited is what a customer would install with it.
    const requirements = join(tmp, "requirements.txt");
    const exported = capture("uv", ["export", "--format", "requirements-txt", "--all-groups", "--no-emit-project", "--quiet", "-o", requirements], { cwd: dir });
    if (exported.status !== 0) return partial(`uv export failed: ${(exported.stderr || "").trim().split("\n").pop()}`);
    const exportedCount = readFileSync(requirements, "utf-8").split("\n").filter((l) => /^[a-zA-Z0-9]/.test(l)).length;

    const res = capture("uvx", ["pip-audit", "-r", join(tmp, "requirements.txt"), "--format", "json", "--progress-spinner", "off"], { cwd: dir });
    let parsed;
    try {
      parsed = JSON.parse(res.stdout);
    } catch {
      return partial(`pip-audit produced no JSON (exit ${res.status}); ${(res.stderr || "").trim().split("\n").pop()}`);
    }
    const deps = parsed.dependencies ?? [];
    const findings = [];
    for (const d of deps) {
      for (const v of d.vulns ?? []) {
        findings.push({
          id: `${v.id}:${d.name}`,
          severity: "unknown",
          title: `${d.name}@${d.version} — ${v.id}`,
          where: (v.fix_versions ?? []).length > 0 ? `fixed in ${v.fix_versions.join(", ")}` : "no fix published",
        });
      }
    }
    // Both numbers, because they differ and the difference is legitimate — an environment marker
    // (`colorama ; sys_platform == 'win32'`) means a package is exported and not installed here, so
    // pip-audit never sees it. Printing only the audited count would read as full coverage of the
    // exported set, which is the PARTIAL-as-pass shape one level down.
    const skipped = exportedCount - deps.length;
    return found(
      findings,
      `${deps.length} audited${skipped > 0 ? ` of ${exportedCount} exported (${skipped} excluded by an environment marker)` : ""}`
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 3. Secrets ----------------------------------------------------------------------------------

function secrets() {
  if (!has("gitleaks")) return partial("gitleaks is not installed — `brew install gitleaks`");

  const tmp = mkdtempSync(join(tmpdir(), "41p-audit-gl-"));
  const report = join(tmp, "gitleaks.json");
  try {
    // Deliberately NOT --redact: the fingerprint below is a hash of the matched text, which is what
    // makes a CHANGED secret re-fire rather than inherit its predecessor's acceptance. The report
    // lands in a temp directory and is removed in the `finally`; nothing from it reaches stdout
    // except the rule, the path and the hash.
    const res = capture("gitleaks", ["detect", "--source", ".", "--no-banner", "--report-format", "json", "--report-path", report]);
    if (!existsSync(report)) return partial(`gitleaks wrote no report (exit ${res.status})`);
    const raw = JSON.parse(readFileSync(report, "utf-8") || "[]");
    const seen = new Map();
    for (const f of raw) {
      // rule + path + hash(secret), and NOT the commit or the line. gitleaks' own fingerprint is
      // `commit:file:rule:line`, which changes every time the surrounding file is edited — a
      // baseline keyed on that goes stale on every commit, and a baseline people regenerate on
      // every commit is a rubber stamp.
      const id = `${f.RuleID}:${f.File}:${fingerprint(f.Secret ?? f.Match ?? "")}`;
      if (seen.has(id)) continue;
      seen.set(id, {
        id,
        severity: "review",
        title: `${f.RuleID} in ${f.File}`,
        where: `first seen ${String(f.Commit ?? "").slice(0, 8)} ${String(f.Date ?? "").slice(0, 10)}`,
      });
    }
    return found([...seen.values()], `${raw.length} raw hits over the whole history`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4. Licences ---------------------------------------------------------------------------------

function licences() {
  const res = capture("node", ["scripts/license-gate.mjs"]);
  const out = `${res.stdout}${res.stderr}`;
  if (res.status !== 0) {
    // The gate failing is a FAIL of this check that no baseline entry may silence: a broken
    // proprietary boundary or a public package pulling a copyleft dependency is not a thing to
    // accept in a JSON file, it is a thing to fix.
    return found(
      [{ id: "license-gate:exit-nonzero", severity: "high", title: "scripts/license-gate.mjs failed", where: out.trim().split("\n").slice(-3).join(" · ") }],
      "the gate itself is red"
    );
  }
  const findings = [];
  for (const line of out.split("\n")) {
    // The gate's own warning format: "  name@version: LICENCE"
    const m = line.match(/^\s{2}(\S+)@([^:\s]+):\s*(.+?)\s*$/);
    if (!m) continue;
    const [, name, version, licence] = m;
    findings.push({
      // Version is deliberately out of the id: a patch bump must not invalidate a licence decision,
      // and a licence CHANGE must re-fire. The version is carried in the title for the reader.
      id: `${name}:${licence}`,
      severity: "review",
      title: `${name}@${version} is ${licence}`,
      where: "private package dependency — EPIC-007 decision 4 makes this a warning, not a block",
    });
  }
  const total = out.match(/(\d+) total in the workspace/);
  return found(findings, total ? `${total[1]} dependencies, SBOM written by the gate` : "");
}

// --- 5. Key inventory ----------------------------------------------------------------------------

// A name that carries a credential. `_KEY_ID` is here because it names half of an access-key pair,
// which is a credential in two parts and not an identifier that happens to sit near one.
const CREDENTIAL_NAME = /(_KEY|_KEY_ID|_SECRET|_TOKEN|_PASSWORD|_DSN)$|^DATABASE_URL$/;

// Names that match the pattern and are not credentials. Each one is listed with its reason, and
// `apps/web/audit.test.ts` asserts this list is exactly these entries — a suppression list that can
// grow quietly is the failure this whole file is written against.
export const NOT_CREDENTIALS = {
  DRIVE_WEB_HAS_SECRET: "a boolean flag in scripts/drive-epic-042.mjs — it says whether a secret was set, and is not one",
};

export function credentialEnvNames(readFile, trackedFiles) {
  const hits = new Map();
  const add = (name, file) => {
    if (!CREDENTIAL_NAME.test(name) || name in NOT_CREDENTIALS) return;
    if (!hits.has(name)) hits.set(name, new Set());
    hits.get(name).add(file);
  };

  for (const file of trackedFiles) {
    const isEnvExample = file === ".env.example";
    const isCompose = /^infra\/docker-compose.*\.ya?ml$/.test(file);
    const isWorkflow = /^\.github\/workflows\/.*\.ya?ml$/.test(file);
    const isShell = /\.sh$/.test(file);
    const isSource = /\.(ts|tsx|mts|mjs|js|py)$/.test(file);
    if (!(isEnvExample || isCompose || isWorkflow || isShell || isSource)) continue;

    let text;
    try {
      text = readFile(file);
    } catch {
      continue;
    }

    if (isEnvExample) for (const m of text.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) add(m[1], file);
    if (isCompose || isWorkflow) {
      for (const m of text.matchAll(/\$\{?\{?\s*([A-Z][A-Z0-9_]{2,})/g)) add(m[1], file);
      for (const m of text.matchAll(/^\s+([A-Z][A-Z0-9_]{2,}):\s/gm)) add(m[1], file);
      for (const m of text.matchAll(/secrets\.([A-Z][A-Z0-9_]{2,})/g)) add(m[1], file);
    }
    if (isShell) {
      for (const m of text.matchAll(/\$\{?([A-Z][A-Z0-9_]{2,})/g)) add(m[1], file);
      // `export NAME=` and a bare `NAME=` assignment: infra/restore.sh sets AWS_SECRET_ACCESS_KEY
      // this way and no interpolation of it ever appears, so an interpolation-only scan misses a
      // credential the script genuinely puts in its environment.
      for (const m of text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,})=/gm)) add(m[1], file);
    }
    if (isSource) {
      for (const m of text.matchAll(
        /process\.env(?:\.([A-Z][A-Z0-9_]{2,})|\[\s*"([A-Z][A-Z0-9_]{2,})"\s*\])|os\.(?:environ(?:\.get\(|\[)|getenv\()\s*"([A-Z][A-Z0-9_]{2,})"/g
      ))
        add(m[1] ?? m[2] ?? m[3], file);
    }
  }
  return hits;
}

export function inventoryNames(markdown) {
  // The Name column of any table row whose first cell is a single backticked SHOUTY_NAME. Prose
  // elsewhere in the document is not a row and is deliberately not matched — see the inventory's
  // own "Not in the table, and why".
  return new Set([...markdown.matchAll(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|/gm)].map((m) => m[1]));
}

function keyInventory() {
  if (!existsSync(INVENTORY_PATH)) {
    return found([{ id: "key-inventory:missing", severity: "high", title: "docs/security/key-inventory.md does not exist", where: INVENTORY_PATH }]);
  }
  const tracked = capture("git", ["ls-files"]).stdout.split("\n").filter(Boolean);
  const used = credentialEnvNames((f) => readFileSync(join(ROOT, f), "utf-8"), tracked);
  const listed = inventoryNames(readFileSync(INVENTORY_PATH, "utf-8"));

  const findings = [];
  for (const [name, files] of [...used].sort()) {
    if (listed.has(name)) continue;
    findings.push({
      id: `key-inventory:undocumented:${name}`,
      severity: "high",
      title: `${name} is used and is not in the inventory`,
      where: [...files].sort().slice(0, 2).join(", "),
    });
  }
  for (const name of [...listed].sort()) {
    if (used.has(name)) continue;
    findings.push({
      id: `key-inventory:unused:${name}`,
      severity: "review",
      title: `${name} is in the inventory and nothing uses it`,
      where: "docs/security/key-inventory.md",
    });
  }
  return found(findings, `${used.size} in use, ${listed.size} documented`);
}

// --- the checks ----------------------------------------------------------------------------------

const CHECKS = [
  { id: "npm-advisories", what: "pnpm audit --json, over the whole workspace", run: npmAdvisories },
  { id: "python-advisories", what: "uv export | pip-audit, over sdks/python's resolved set", run: pythonAdvisories },
  { id: "secrets", what: "gitleaks detect over the whole git history", run: secrets },
  { id: "licences", what: "scripts/license-gate.mjs, and the CycloneDX SBOM it writes", run: licences },
  { id: "key-inventory", what: "the tree's credential env names against docs/security/key-inventory.md, both ways", run: keyInventory },
];

// --- the baseline --------------------------------------------------------------------------------

export function readBaseline(text) {
  const parsed = JSON.parse(text);
  const accepted = parsed.accepted ?? [];
  const byId = new Map();
  for (const entry of accepted) byId.set(entry.id, entry);
  return { accepted, byId };
}

export function compare(checkId, findings, baseline, today) {
  const isNew = [];
  const silenced = [];
  const expired = [];
  for (const f of findings) {
    const entry = baseline.byId.get(f.id);
    if (!entry) isNew.push(f);
    else if (entry.reviewOn && entry.reviewOn < today) expired.push({ ...f, entry });
    else silenced.push(f);
  }
  const ids = new Set(findings.map((f) => f.id));
  const stale = baseline.accepted.filter((e) => e.check === checkId && !ids.has(e.id));
  return { isNew, silenced, expired, stale };
}

// --- run -----------------------------------------------------------------------------------------

// `apps/web/audit.test.ts` imports `compare`, `credentialEnvNames`, `inventoryNames` and
// `NOT_CREDENTIALS` from this file, so everything below is behind the same main-module guard
// `scripts/third-party-notices.mjs` uses. Without it, importing the module to test a pure function
// would run five subprocesses and call `process.exit`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

function main() {
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("usage: node scripts/audit.mjs [--explain] [--json] [--only <id,id>]");
  console.log("");
  console.log("  the monthly dependency, licence and security audit (EPIC-901).");
  console.log("  --explain   print what each check runs, and run nothing");
  console.log("  --json      the findings as JSON, for writing the month's document");
  console.log("  --only      run a subset, for debugging this script");
  console.log("");
  for (const c of CHECKS) console.log(`  ${pad(c.id, 20)}${c.what}`);
  process.exit(0);
}

if (argv.includes("--explain")) {
  console.log(bold("audit — what each check runs"));
  for (const c of CHECKS) console.log(`  ${pad(c.id, 20)}${c.what}`);
  console.log(`\n  baseline: ${BASELINE_PATH.replace(`${ROOT}/`, "")}`);
  console.log("  a finding not in the baseline FAILS; a baseline entry matching nothing FAILS.");
  process.exit(0);
}

const onlyArg = argv.indexOf("--only");
const only = onlyArg === -1 ? null : new Set((argv[onlyArg + 1] ?? "").split(",").filter(Boolean));
const asJson = argv.includes("--json");

if (!existsSync(BASELINE_PATH)) {
  console.error(`audit: ${BASELINE_PATH} does not exist. It is the file that decides what is new.`);
  process.exit(2);
}
const baseline = readBaseline(readFileSync(BASELINE_PATH, "utf-8"));
const today = new Date().toISOString().slice(0, 10);

const rows = [];
const report = {};
for (const check of CHECKS) {
  if (only && !only.has(check.id)) continue;
  if (!asJson) process.stderr.write(`  … ${check.id}\n`);
  const result = check.run();
  if (result.status === "partial") {
    rows.push({ id: check.id, verdict: "partial", note: result.note });
    report[check.id] = { verdict: "partial", note: result.note, findings: [] };
    continue;
  }
  const cmp = compare(check.id, result.findings, baseline, today);
  const bad = cmp.isNew.length + cmp.expired.length + cmp.stale.length;
  const note = [
    result.note,
    cmp.silenced.length > 0 ? `${cmp.silenced.length} accepted` : "",
    cmp.isNew.length > 0 ? red(`${cmp.isNew.length} new`) : "",
    cmp.expired.length > 0 ? red(`${cmp.expired.length} past review date`) : "",
    cmp.stale.length > 0 ? red(`${cmp.stale.length} stale baseline entr${cmp.stale.length === 1 ? "y" : "ies"}`) : "",
  ]
    .filter(Boolean)
    .join(", ");
  rows.push({ id: check.id, verdict: bad === 0 ? "pass" : "fail", note, detail: cmp });
  report[check.id] = {
    verdict: bad === 0 ? "pass" : "fail",
    note: result.note,
    findings: result.findings,
    new: cmp.isNew.map((f) => f.id),
    expired: cmp.expired.map((f) => f.id),
    stale: cmp.stale.map((e) => e.id),
  };
}

if (asJson) {
  console.log(JSON.stringify({ date: today, checks: report }, null, 2));
  process.exit(rows.some((r) => r.verdict === "fail") ? 1 : 0);
}

// Everything that failed, in full, before the table — a table is a verdict and this is the content.
for (const row of rows) {
  if (row.verdict !== "fail") continue;
  const { isNew, expired, stale } = row.detail;
  console.log(`\n${bold(row.id)}`);
  for (const f of isNew) {
    console.log(`  ${red("NEW")}      [${f.severity}] ${f.title}`);
    if (f.where) console.log(`           ${f.where}`);
    console.log(`           id: ${f.id}`);
  }
  for (const f of expired) {
    console.log(`  ${red("REVIEW")}   ${f.title}`);
    console.log(`           accepted ${f.entry.acceptedOn} by ${f.entry.acceptedBy}, to be reviewed by ${f.entry.reviewOn}`);
    console.log(`           ${f.entry.why}`);
  }
  for (const e of stale) {
    console.log(`  ${red("STALE")}    baseline entry matches nothing: ${e.id}`);
    console.log(`           ${e.what}`);
    console.log(`           Remove it, or find out why the finding went away.`);
  }
}

const width = Math.max(...rows.map((r) => r.id.length), 20);
console.log(`\n${bold("audit — every check, every result")}`);
console.log("-".repeat(width + 30));
for (const row of rows) {
  const verdict = row.verdict === "partial" ? amber("PARTIAL") : row.verdict === "pass" ? green("PASS") : red("FAIL");
  console.log(`  ${pad(row.id, width)}  ${pad(verdict, 12)}${row.note}`);
}
console.log("-".repeat(width + 30));

const failed = rows.filter((r) => r.verdict === "fail");
const partials = rows.filter((r) => r.verdict === "partial");
console.log(
  `  ${rows.length} checked, ` +
    `${failed.length === 0 ? green(`${rows.length - partials.length} passed`) : `${rows.length - failed.length - partials.length} passed, ${red(`${failed.length} failed`)}`}` +
    `${partials.length > 0 ? `, ${amber(`${partials.length} partial`)}` : ""}`
);
if (partials.length > 0) {
  console.log(amber(`  ${partials.map((p) => p.id).join(", ")} did not run.`));
  console.log(amber("  This run is NOT a full pass. Say so rather than calling it clean."));
}
console.log(`\n  Accepted findings and their reasons: ${BASELINE_PATH.replace(`${ROOT}/`, "")}`);
console.log(`  The month's write-up goes in docs/security/audit-<yyyy-mm>.md.\n`);

process.exit(failed.length > 0 ? 1 : 0);
}
