#!/usr/bin/env node
// Run one gate across **every** package and report every package's result.
//
// ## The defect this fixes
//
// `turbo run test` stops scheduling when a task fails. A run that hit a failure in the second of
// eight packages printed `Tasks: 5 successful, 8 total` and exited — and that line was read, for two
// days during the Actions billing block, as "local gates pass". It meant "the packages that ran,
// ran". The three that never started were the ones the change had touched most, and two real
// defects (a stylesheet written against the mockup's variable names, and a heading-order failure)
// reached CI because of it.
//
// `pnpm lint` had the same shape for a different reason: four checks chained with `&&`, so a lint
// failure meant dependency-cruiser, turbo boundaries and the forbidden-word grep never ran at all.
//
// So: every task runs, every package is named in the summary with its own result, and a partial run
// is impossible to read as a full one — because a partial run cannot happen quietly.
//
// ## The database
//
// Six suites across three packages need Postgres. Letting them fail makes "no database here"
// indistinguishable from "this code is broken"; letting them skip silently is the failure being
// fixed. So this starts a **throwaway container** for the run and removes it afterwards. Without
// Docker the suites skip, say so at the point of skipping, and the summary marks those packages
// PARTIAL with the reason.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const task = process.argv[2];
if (!["test", "typecheck", "lint"].includes(task ?? "")) {
  console.error("usage: node scripts/gates.mjs <test|typecheck|lint>");
  process.exit(2);
}

const RUNS_DIR = ".turbo/runs";
const CONTAINER = "41p-gates-postgres";
const PG_PORT = 55432;
const PG_URL = `postgres://41p:41p@127.0.0.1:${PG_PORT}/41p`;

// Packages whose suites need Postgres. Named here so the summary can say *why* a package is
// partial; the suites themselves are guarded by `HAS_TEST_DATABASE` in packages/db/src/testing.ts.
const NEEDS_DATABASE = ["@41prompts/db", "@41prompts/worker", "@41prompts/web"];

const ESC = "[";
const bold = (s) => `${ESC}1m${s}${ESC}22m`;
const green = (s) => `${ESC}32m${s}${ESC}39m`;
const red = (s) => `${ESC}31m${s}${ESC}39m`;
const amber = (s) => `${ESC}33m${s}${ESC}39m`;
const plain = (s) => s.replace(/\[\d+m/g, "");
const pad = (s, n) => s + " ".repeat(Math.max(0, n - plain(s).length));

const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" });
const quiet = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: "utf-8" });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};
const sleep = (ms) => spawnSync(process.execPath, ["-e", `setTimeout(()=>{}, ${ms})`]);

// --- the throwaway database ---------------------------------------------------------------------

const dockerAvailable = () => quiet("docker", ["info"]).ok;

function startDatabase() {
  quiet("docker", ["rm", "-f", CONTAINER]);
  const started = quiet("docker", [
    "run", "-d", "--rm", "--name", CONTAINER,
    "-e", "POSTGRES_USER=41p", "-e", "POSTGRES_PASSWORD=41p", "-e", "POSTGRES_DB=41p",
    "-p", `${PG_PORT}:5432`,
    "--health-cmd", "pg_isready -U 41p -d 41p",
    "--health-interval", "1s", "--health-timeout", "3s", "--health-retries", "30",
    "postgres:16",
  ]);
  if (!started.ok) {
    console.warn(amber(`  could not start the throwaway database: ${started.out.trim()}`));
    return false;
  }
  process.stdout.write("  waiting for the throwaway database");
  for (let i = 0; i < 60; i += 1) {
    if (quiet("docker", ["inspect", "-f", "{{.State.Health.Status}}", CONTAINER]).out.trim() === "healthy") {
      process.stdout.write(" ready\n");
      return true;
    }
    process.stdout.write(".");
    sleep(1000);
  }
  process.stdout.write(" gave up\n");
  quiet("docker", ["rm", "-f", CONTAINER]);
  return false;
}

const stopDatabase = () => quiet("docker", ["rm", "-f", CONTAINER]);

// --- running one task ----------------------------------------------------------------------------

function newestSummary(after) {
  if (!existsSync(RUNS_DIR)) return undefined;
  const files = readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ f, t: statSync(join(RUNS_DIR, f)).mtimeMs }))
    .filter(({ t }) => t >= after)
    .sort((a, b) => b.t - a.t);
  if (files.length === 0) return undefined;
  try {
    return JSON.parse(readFileSync(join(RUNS_DIR, files[0].f), "utf-8"));
  } catch {
    return undefined;
  }
}

function turbo(name) {
  const before = Date.now();
  const result = run("npx", ["turbo", "run", name, "--continue", "--summarize"]);
  const summary = newestSummary(before);
  // **Filter to the task that was asked for.** A task with `dependsOn` pulls its dependencies into
  // the same run summary, so `typecheck` — which now depends on `build` — returns twelve rows for
  // eight packages, several of them named twice. A table headed "every package, every result" that
  // lists a package twice invites exactly the misreading this script exists to prevent.
  const rows = (summary?.tasks ?? []).filter((t) => t.task === name).map((t) => ({
    name: t.package,
    ok: t.execution?.exitCode === 0,
    note: t.cache?.status === "HIT" ? "cached" : "",
  }));
  // **No summary is not a pass.** If turbo could not tell us what ran, the whole point of this
  // script is gone, so say that rather than inferring one row from an exit code.
  if (rows.length === 0) {
    return [{
      name: `turbo run ${name}`,
      ok: false,
      note: red("no per-package summary — cannot confirm every package ran"),
    }];
  }
  return rows;
}

const step = (label, cmd, args) => [{ name: label, ok: run(cmd, args).status === 0, note: "" }];

// --- the rest of what a test run needs -------------------------------------------------------------
//
// `DATABASE_URL` is not the only thing missing locally. `apps/web`'s auth suite constructs Better
// Auth, which wants a URL, a signing secret and a provider pair before it will start — so a
// database alone moved the failure rather than fixing it.
//
// **These are the same values `.github/workflows/ci.yml` sets**, deliberately, so that a local run
// and a CI run are looking at the same configuration. They are placeholders and not credentials:
// nothing in the suite drives a real OAuth round trip, and the magic-link tests read their token
// straight from the database. Set only when unset, so a real local `.env` always wins.
const CI_PLACEHOLDERS = {
  DEPLOY_ENV: "development",
  BETTER_AUTH_SECRET: "ci-secret-not-for-prod-0123456789",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "ci-google-client-id",
  GOOGLE_CLIENT_SECRET: "ci-google-client-secret",
  GITHUB_CLIENT_ID: "ci-github-client-id",
  GITHUB_CLIENT_SECRET: "ci-github-client-secret",
};

if (task === "test") {
  for (const [key, value] of Object.entries(CI_PLACEHOLDERS)) {
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = value;
  }
}

// --- decide about the database --------------------------------------------------------------------

let usingDatabase = typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL !== "";
let databaseNote = usingDatabase ? "DATABASE_URL from the environment" : "";
let startedContainer = false;

if (task === "test" && !usingDatabase) {
  if (!dockerAvailable()) {
    databaseNote = "Docker is not available";
  } else if (startDatabase()) {
    process.env.DATABASE_URL = PG_URL;
    startedContainer = true;
    usingDatabase = true;
    databaseNote = "throwaway container";
    if (run("pnpm", ["--filter", "@41prompts/db", "db:migrate"]).status !== 0) {
      console.error(red("  migrations failed against the throwaway database"));
      stopDatabase();
      process.exit(1);
    }
  } else {
    databaseNote = "the throwaway container would not start";
  }
}

// --- run ------------------------------------------------------------------------------------------

const rows = [];
try {
  if (task === "lint") {
    // Four checks that used to be chained with `&&`, so the first failure hid the other three.
    rows.push(...turbo("lint"));
    rows.push(...step("dependency-cruiser boundaries", "pnpm", ["-s", "boundaries"]));
    rows.push(...step("turbo boundaries", "npx", ["turbo", "boundaries"]));
    rows.push(...step("forbidden-word grep", "pnpm", ["-s", "forbidden-words"]));
  } else {
    rows.push(...turbo(task));
  }
} finally {
  if (startedContainer) stopDatabase();
}

// --- the summary, which is the point ---------------------------------------------------------------

const partial = task === "test" && !usingDatabase
  ? NEEDS_DATABASE.filter((n) => rows.some((r) => r.name === n))
  : [];

const width = Math.max(...rows.map((r) => r.name.length), 30);
console.log(`\n${bold(`${task} — every package, every result`)}`);
console.log("-".repeat(width + 26));
for (const row of rows) {
  const isPartial = partial.includes(row.name);
  const verdict = isPartial ? amber("PARTIAL") : row.ok ? green("PASS") : red("FAIL");
  const note = isPartial ? `database suites skipped: ${databaseNote}` : row.note;
  console.log(`  ${pad(row.name, width)}  ${pad(verdict, 12)}${note}`);
}
console.log("-".repeat(width + 26));

const failed = rows.filter((r) => !r.ok);
if (task === "test") {
  console.log(`  database: ${usingDatabase ? green(databaseNote) : amber(`none — ${databaseNote}`)}`);
}
console.log(
  `  ${rows.length} checked, ` +
    `${failed.length === 0 ? green(`${rows.length} passed`) : `${rows.length - failed.length} passed, ${red(`${failed.length} failed`)}`}` +
    `${partial.length > 0 ? `, ${amber(`${partial.length} partial`)}` : ""}`
);
if (partial.length > 0) {
  console.log(amber(`  ${partial.join(", ")} ran without their database suites.`));
  console.log(amber("  This run is NOT a full pass. Say so rather than calling it clean."));
}
console.log();

process.exit(failed.length > 0 ? 1 : 0);
