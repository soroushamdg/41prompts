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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { availableParallelism, cpus as osCpus, tmpdir } from "node:os";
import { join } from "node:path";

import { applyWhenUnset, placeholders } from "../apps/web/e2e/env.mjs";

const task = process.argv[2];
if (!["test", "typecheck", "lint", "ci"].includes(task ?? "")) {
  console.error("usage: node scripts/gates.mjs <test|typecheck|lint|ci>");
  console.error("");
  console.error("  test|typecheck|lint   one gate, in this working tree, across every package");
  console.error("  ci                    every gate CI runs, in CI's order, in a clean checkout of");
  console.error("                        HEAD with a frozen-lockfile install and a cold cache.");
  console.error("                        Flags: --ref <rev> --fail-fast --keep --allow-dirty");
  console.error("                               --only <key,key>  (for debugging this mode itself)");
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

// `availableParallelism` respects a container's CPU quota where `cpus().length` reports the host's,
// which is the difference between sizing for a 2-core runner and sizing for the machine it happens
// to be hosted on. It arrived in Node 18.14 and this repository is on 22; the fallback is there
// because a gate that throws on an older Node reports nothing about the code.
const cpuCount = () => (typeof availableParallelism === "function" ? availableParallelism() : osCpus().length);

// --- the throwaway database ---------------------------------------------------------------------

const dockerAvailable = () => quiet("docker", ["info"]).ok;

// Parameterised by name and port so CI mode can start its own without evicting the container a
// concurrent `pnpm test` is using. Two sessions share this worktree, and a gate that kills another
// gate's database is a gate that invents failures.
function startDatabase(name = CONTAINER, port = PG_PORT) {
  quiet("docker", ["rm", "-f", name]);
  const started = quiet("docker", [
    "run", "-d", "--rm", "--name", name,
    "-e", "POSTGRES_USER=41p", "-e", "POSTGRES_PASSWORD=41p", "-e", "POSTGRES_DB=41p",
    "-p", `${port}:5432`,
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
    if (quiet("docker", ["inspect", "-f", "{{.State.Health.Status}}", name]).out.trim() === "healthy") {
      process.stdout.write(" ready\n");
      return true;
    }
    process.stdout.write(".");
    sleep(1000);
  }
  process.stdout.write(" gave up\n");
  quiet("docker", ["rm", "-f", name]);
  return false;
}

const stopDatabase = (name = CONTAINER) => quiet("docker", ["rm", "-f", name]);

// Is the container still there? Asked after **every** CI-mode step, because a database that
// disappears mid-run makes an environment event look exactly like a code failure — the confusion
// this whole script exists to remove. It happened on the first verification run of CI mode itself:
// Docker was purged from under a live e2e suite and 178 passing tests became `ECONNREFUSED`.
const databaseAlive = (name) =>
  quiet("docker", ["inspect", "-f", "{{.State.Running}}", name]).out.trim() === "true";

// --- CI mode: a clean checkout, a frozen install, a cold cache, CI's own order -------------------
//
// ## The defect this fixes
//
// The three tasks above run against **this** working tree: the `node_modules` that is already
// installed, the turbo cache that is already warm, the `dist/` folders that are already built, the
// `.env` that is already loaded, and — crucially — files that exist on disk but are not in any
// commit. CI has none of that. It clones, installs from the lockfile, builds everything cold, and
// sees only what was committed. So "green locally" and "green in CI" are answers to two different
// questions, and the gap has been paid for repeatedly:
//
//   - `apps/worker/src/runs/execute.ts` carried a NUL byte. `binary-files` was green locally while
//     the file was unstaged, then red in CI once it was committed (2026-09-14, Compliance #202).
//   - `packages/core/dist` was a September 12 build; the app built against it locally and CI, which
//     had no `dist` at all, built the real thing and failed on a missing export.
//   - `pnpm test` was green in a tree where `packages/core/src/key-collision.test.ts` could read
//     `apps/worker/…`; the public mirror has no `apps/`, and only CI ran the mirror
//     (2026-09-14, Compliance #209).
//
// `node scripts/gates.mjs ci` closes that by construction: a fresh `git clone` of a **commit**, a
// `--frozen-lockfile` install, no cache to hit, and every gate both workflows run, in the order
// they run them. It is slower than the three tasks above by roughly an order of magnitude, and that
// is the whole point — it is the thing to run before a push, not while writing code.
//
// ## What it still cannot reproduce, and says so
//
// Two classes of CI failure survive a perfect checkout, so the summary names them rather than
// leaving a green table to imply they were covered:
//
//   1. **The runner is a different, slower machine.** A test whose `expect.poll` callback threw on
//      the first attempt passed here and failed there (2026-09-14, CI #209). No local mode fixes
//      that; only the test does.
//   2. **The runner is Linux.** The four visual-regression baselines are `-linux.png` and their
//      specs skip on darwin, so a layout change can pass every local run and fail CI
//      (2026-09-14, CI #206). `PROCESS.md`, "Visual-regression baselines", has the Docker procedure
//      that does cover them.

const CI_CONTAINER = "41p-gates-ci-postgres";
const CI_PG_PORT = 55433;

const clock = (ms) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
};

// Is something already answering on this port? Playwright's own check is a request to the url, and
// with `CI` set `reuseExistingServer` is false — so anything listening on 3000 fails the suite here
// while CI, which starts clean, would have been fine. A connect test is what predicts that.
const portInUse = (p) =>
  spawnSync(process.execPath, [
    "-e",
    `const s=require("node:net").connect({host:"127.0.0.1",port:${p}});s.setTimeout(700);` +
      `s.once("connect",()=>{s.destroy();process.exit(0)});s.once("error",()=>process.exit(1));` +
      `s.once("timeout",()=>{s.destroy();process.exit(1)});`,
  ]).status === 0;

const freePort = () => {
  if (!portInUse(3000)) return 3000;
  for (let p = 3100; p < 3200; p += 1) if (!portInUse(p)) return p;
  return 0;
};

// **The environment is built, not inherited.** A local shell carries `.env`-derived values, an
// `E2E_DEV` left over from an afternoon of iterating, a real `ANTHROPIC_API_KEY`; CI carries the
// block in `ci.yml` and nothing else. Inheriting would reintroduce the class of difference this
// mode exists to remove, so only the names below cross over — the ones a toolchain needs to find
// its own store, cache and home — and everything else is set explicitly.
const CI_MODE_PASS_THROUGH = [
  "PATH", "HOME", "SHELL", "USER", "LOGNAME", "LANG", "LC_ALL", "TERM", "TMPDIR",
  "PNPM_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "PLAYWRIGHT_BROWSERS_PATH", "DOCKER_HOST", "SSH_AUTH_SOCK", "__CF_USER_TEXT_ENCODING",
];

function ciEnvironment(port, databaseUrl) {
  const env = {};
  for (const key of CI_MODE_PASS_THROUGH) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {
    ...env,
    // `ci.yml`'s env block, verbatim, plus the two CI sets for itself. `CI=1` is what turns off
    // Playwright's `reuseExistingServer`, which is the difference between the suite driving our
    // build and the suite driving whatever was already on the port.
    CI: "1",
    DATABASE_URL: databaseUrl,
    // The same placeholders `pnpm e2e` fills in for itself, from the same module — CI mode forces
    // them rather than filling gaps, because it has already stripped the environment.
    ...placeholders(port),
    E2E_PORT: String(port),
    // Not CI's, but noise either way, and telemetry from a throwaway checkout is worse than noise.
    TURBO_TELEMETRY_DISABLED: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
  };
}

// Every gate both workflows run, in the order they run them: `ci.yml`'s steps top to bottom, then
// `compliance.yml`'s four jobs in declaration order.
//
// **The duplicates are deliberate.** `pnpm lint` (through this script) already runs
// dependency-cruiser, turbo boundaries and the forbidden-word grep, and `compliance.yml` runs the
// same three again in its own job. CI genuinely pays for both because the jobs are parallel. Not
// de-duplicating here costs about forty seconds and keeps one promise: this is the set CI runs. A
// mode that prunes CI's list is a mode that can diverge from it.
const ciSteps = () => [
  { key: "install", phase: "ci.yml", label: "pnpm install --frozen-lockfile", cmd: "pnpm install --frozen-lockfile" },
  { key: "lint", phase: "ci.yml", label: "pnpm lint", cmd: "pnpm lint" },
  { key: "typecheck", phase: "ci.yml", label: "pnpm typecheck", cmd: "pnpm typecheck" },
  { key: "migrate", phase: "ci.yml", label: "pnpm db:migrate", cmd: "pnpm db:migrate" },
  { key: "test", phase: "ci.yml", label: "pnpm test", cmd: "pnpm test" },
  {
    key: "browsers",
    phase: "ci.yml",
    label: "playwright install chromium",
    // `--with-deps` is apt, so it is Linux-only; the browser itself is pinned by the lockfile and
    // cached per machine, which makes this a fast no-op locally and a download in CI.
    cmd: `pnpm exec playwright install ${process.platform === "linux" ? "--with-deps " : ""}chromium`,
  },
  { key: "e2e", phase: "ci.yml", label: "pnpm e2e", cmd: "pnpm e2e" },
  { key: "pytest", phase: "ci.yml", label: "uv run pytest -q (sdks/python)", cmd: "uv run pytest -q", cwd: "sdks/python" },
  { key: "reuse", phase: "compliance.yml", label: "reuse lint", cmd: "pnpm reuse-lint" },
  { key: "boundaries", phase: "compliance.yml", label: "pnpm boundaries", cmd: "pnpm boundaries" },
  { key: "turbo-boundaries", phase: "compliance.yml", label: "turbo boundaries", cmd: "pnpm exec turbo boundaries" },
  { key: "forbidden-words", phase: "compliance.yml", label: "pnpm forbidden-words", cmd: "pnpm forbidden-words" },
  { key: "binary-files", phase: "compliance.yml", label: "pnpm binary-files", cmd: "pnpm binary-files" },
  { key: "dead-code", phase: "compliance.yml", label: "pnpm dead-code", cmd: "pnpm dead-code" },
  { key: "license-gate", phase: "compliance.yml", label: "license-gate --sbom", cmd: "node scripts/license-gate.mjs --sbom sbom" },
  { key: "mirror-dry-run", phase: "compliance.yml", label: "pnpm mirror-dry-run", cmd: "pnpm mirror-dry-run" },
];

const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

function runCi() {
  const argv = process.argv.slice(3);
  const has = (name) => argv.includes(name);
  const valueOf = (name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);

  const only = valueOf("--only")?.split(",").map((s) => s.trim()).filter(Boolean);
  const failFast = has("--fail-fast");

  // --- preflight: refuse to start a run that cannot be a full one ---------------------------------
  const missing = [];
  if (!dockerAvailable()) {
    missing.push("Docker is not running. CI mode needs it for the Postgres `ci.yml` gives the job.");
  }
  if (!quiet("uv", ["--version"]).ok) {
    missing.push("`uv` is not on PATH. sdks/python's tests need it (`brew install uv`).");
  }
  if (!quiet("uvx", ["--version"]).ok) {
    missing.push("`uvx` is not on PATH. `reuse lint` and the mirror dry run need it (`brew install uv`).");
  }
  if (missing.length > 0) {
    console.error(red("\nCI mode cannot start, and will not start partially:\n"));
    for (const line of missing) console.error(`  - ${line}`);
    console.error("\nA run missing a gate is the failure this mode exists to remove.\n");
    process.exit(2);
  }

  const root = quiet("git", ["rev-parse", "--show-toplevel"]).out.trim();
  const ref = valueOf("--ref") ?? "HEAD";
  const resolved = quiet("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!resolved.ok) {
    console.error(red(`\n${ref} is not a commit in this repository.\n`));
    process.exit(2);
  }
  const sha = resolved.out.trim();

  // **A dirty tree is a hard stop.** This mode tests a commit, because that is what CI tests and
  // what a push sends. Running it over a tree with uncommitted work would produce a green that is
  // about a different tree — which is the shape of every failure listed at the top of this section.
  const dirty = quiet("git", ["status", "--porcelain"]).out.trim();
  if (dirty !== "" && !has("--allow-dirty")) {
    console.error(red("\nThe working tree is not clean, and CI mode tests a commit, not a tree.\n"));
    for (const line of dirty.split("\n")) console.error(`  ${line}`);
    console.error(
      "\nCommit (or stash) first. `--allow-dirty` runs anyway against " +
        `${sha.slice(0, 8)} and reports that these files were not in it.\n`
    );
    process.exit(2);
  }

  const port = freePort();
  if (port === 0) {
    console.error(red("\nNo free port in 3000 or 3100-3199 for the e2e server.\n"));
    process.exit(2);
  }

  const scratch = mkdtempSync(join(tmpdir(), "41p-ci-"));
  const checkout = join(scratch, "repo");
  const logDir = join(scratch, "logs");
  mkdirSync(logDir, { recursive: true });

  const databaseUrl = `postgres://41p:41p@127.0.0.1:${CI_PG_PORT}/41p`;
  const env = ciEnvironment(port, databaseUrl);

  const subject = quiet("git", ["log", "-1", "--format=%s", sha]).out.trim();
  console.log(bold("\nCI mode — clean checkout, frozen lockfile, cold cache, CI's order"));
  console.log(`  commit    ${sha.slice(0, 8)}  ${subject}`);
  console.log(`  checkout  ${checkout}`);
  console.log(`  logs      ${logDir}`);
  console.log(`  e2e port  ${port}${port === 3000 ? "" : amber("  (3000 was in use)")}`);
  if (only) {
    console.log(amber(`  --only ${only.join(",")} — this is NOT a full CI-mode run`));
  }

  const began = Date.now();
  const rows = [];
  let startedContainer = false;
  let databaseVanished = false;

  try {
    // --- the clean checkout ------------------------------------------------------------------------
    // `--no-hardlinks` for the same reason `mirror-dry-run.sh` uses it: nothing in the scratch copy
    // should share an object with the real repository. Full history, because the mirror dry run
    // filters it and a shallow clone would truncate what that gate is meant to prove survives.
    const cloneBegan = Date.now();
    const cloned =
      run("git", ["clone", "--no-hardlinks", "--quiet", root, checkout]).status === 0 &&
      run("git", ["-C", checkout, "checkout", "--quiet", "--detach", sha]).status === 0;
    rows.push({
      name: `git clone + checkout ${sha.slice(0, 8)}`,
      phase: "checkout",
      ok: cloned,
      ms: Date.now() - cloneBegan,
      note: "",
    });
    if (!cloned) throw new Error("the clean checkout failed");

    // --- the database ci.yml gives the job --------------------------------------------------------
    // Started here and migrated by a *step*, not here: `pnpm db:migrate` is `ci.yml`'s third step,
    // after lint and typecheck, and running it early would hide a migration that only works once
    // something else has run.
    if (!startDatabase(CI_CONTAINER, CI_PG_PORT)) {
      throw new Error("the throwaway database would not start");
    }
    startedContainer = true;

    // --- the gates, in CI's order -----------------------------------------------------------------
    let n = 1;
    let stopped = false;
    for (const spec of ciSteps()) {
      const index = String(n).padStart(2, "0");
      n += 1;
      if (only && !only.includes(spec.key)) continue;
      if (stopped) {
        rows.push({ name: spec.label, phase: spec.phase, ok: false, ms: 0, note: amber("not run — stopped at the first failure"), skipped: true });
        continue;
      }
      const logFile = join(logDir, `${index}-${spec.key}.log`);
      const cwd = spec.cwd ? join(checkout, spec.cwd) : checkout;
      console.log(bold(`\n[${spec.phase}] ${spec.cmd}${spec.cwd ? `   (in ${spec.cwd})` : ""}`));
      const stepBegan = Date.now();
      // Through bash with `tee` so the run is watchable *and* kept: a fifteen-minute run whose
      // output only went to a terminal cannot be quoted in a report afterwards. `pipefail` so the
      // status is the gate's and not `tee`'s.
      const result = spawnSync(
        "/bin/bash",
        ["-c", `set -o pipefail; ${spec.cmd} 2>&1 | tee ${shellQuote(logFile)}`],
        { cwd, env, stdio: "inherit" }
      );
      const row = {
        name: spec.label,
        phase: spec.phase,
        ok: result.status === 0,
        ms: Date.now() - stepBegan,
        note: "",
        logFile,
        key: spec.key,
      };
      // What the e2e suite did **not** run is the half of its result that a pass hides. The visual
      // baselines skip on darwin, and that is a real CI failure this mode cannot see.
      if (spec.key === "e2e" && existsSync(logFile)) {
        const skipped = readFileSync(logFile, "utf-8").match(/(\d+) skipped/);
        if (skipped) row.note = amber(`${skipped[1]} test(s) skipped on ${process.platform}`);
      }
      // A vanished database is not a verdict on the code. Say so on the row and again in the
      // summary, rather than letting the step read as the failure it looks like.
      if (!databaseAlive(CI_CONTAINER)) {
        databaseVanished = true;
        row.note = red("the throwaway database is gone — this step is not a verdict on the code");
      }
      rows.push(row);
      if (!row.ok && failFast) stopped = true;
    }
  } catch (error) {
    rows.push({ name: String(error.message ?? error), phase: "setup", ok: false, ms: 0, note: "" });
  } finally {
    if (startedContainer) stopDatabase(CI_CONTAINER);
  }

  // --- the summary --------------------------------------------------------------------------------
  const elapsed = Date.now() - began;
  const failed = rows.filter((r) => !r.ok && !r.skipped);
  const width = Math.max(...rows.map((r) => r.name.length), 34);

  console.log(`\n${bold("CI mode — every gate CI runs, every result")}`);
  console.log("-".repeat(width + 34));
  let phase = "";
  for (const row of rows) {
    if (row.phase !== phase) {
      phase = row.phase;
      console.log(`  ${bold(phase)}`);
    }
    const verdict = row.skipped ? amber("NOT RUN") : row.ok ? green("PASS") : red("FAIL");
    const time = row.ms > 0 ? clock(row.ms) : "";
    console.log(`    ${pad(row.name, width)}  ${pad(verdict, 12)}${pad(time, 9)}${row.note}`);
  }
  console.log("-".repeat(width + 34));
  console.log(
    `  ${rows.length} step(s), ` +
      `${failed.length === 0 ? green("all passed") : red(`${failed.length} failed`)}` +
      `, ${bold(clock(elapsed))} wall`
  );

  if (databaseVanished) {
    console.log(
      red("\n  The throwaway database disappeared during this run, so this is NOT a result.") +
        "\n  Every step after it lost its Postgres; a failure there says nothing about the code." +
        "\n  Check `docker system df` and Docker Desktop's disk, then run it again."
    );
  }

  // --- what a green here still does not cover -----------------------------------------------------
  const caveats = [];
  if (process.platform !== "linux") {
    caveats.push(
      `The runner is Linux and this is ${process.platform}: the four visual-regression baselines ` +
        "are `-linux.png` and their specs skip here. A layout change can pass this run and fail CI " +
        "(2026-09-14, CI #206). PROCESS.md, \"Visual-regression baselines\", has the Docker procedure."
    );
  }
  caveats.push(
    "The runner is slower than this machine. A test that only fails under load — the 2026-09-14 " +
      "`expect.poll` case, CI #209 — passes here for the same reason it passed before."
  );
  if (quiet("git", ["rev-parse", "--verify", "origin/main"]).ok) {
    const behind = Number(quiet("git", ["rev-list", "--count", `${sha}..origin/main`]).out.trim());
    if (behind > 0) {
      caveats.push(
        `origin/main, as last fetched, has ${behind} commit(s) this checkout does not — and may ` +
          "have more. A pull_request run tests the **merge** of the branch into main, so a semantic " +
          "conflict with those commits is invisible here."
      );
    }
  }
  if (only) {
    caveats.push(red("`--only` was used. This was not a CI-mode run; it was some of one."));
  }
  if (dirty !== "") {
    caveats.push(red(`--allow-dirty: ${dirty.split("\n").length} uncommitted file(s) were NOT part of this run.`));
  }
  console.log(`\n  ${bold("What a green here still does not cover")}`);
  for (const caveat of caveats) console.log(`    ${amber("·")} ${caveat}`);

  // Kept on failure: the logs are the evidence, and a fifteen-minute run is not worth repeating to
  // read one of them. Removed on success, because then nothing in there is wanted.
  if (failed.length > 0 || has("--keep")) {
    console.log(`\n  logs kept: ${logDir}`);
    console.log(`  checkout kept: ${checkout}  (rm -rf ${scratch} when done)`);
  } else {
    rmSync(scratch, { recursive: true, force: true });
  }
  console.log();
  process.exit(failed.length > 0 ? 1 : 0);
}

if (task === "ci") runCi();


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

/**
 * **Nine packages each sized their own worker pool to the machine, and turbo ran all nine at once.**
 *
 * Vitest's fork pool defaults to roughly one worker per core *per package*, and `turbo run` defaults
 * to ten concurrent tasks. Measured on this machine (8 cores) during one `pnpm test`, sampling every
 * four seconds: **71 concurrent vitest processes at peak, and a one-minute load average of 262** —
 * thirty-three times the number of cores. Nothing was wrong with any of those suites.
 *
 * That is what every unexplained timeout in this repository has been. Failures arrived as
 * `Test timed out in 5000ms` in packages a change had never touched, and as
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` — a **sixty-second** RPC to a main process that
 * could not get scheduled — in a package reporting 581 of 581 tests passed. `@41prompts/sdk`'s
 * never-throws fuzz takes 320 ms alone and 5,880 ms inside a parallel run, against a 5,000 ms
 * budget. Each was explained as the machine being busy, which was true and was not the cause: the
 * run was the machine being busy.
 *
 * So the total is budgeted instead of being left to nine independent guesses. `VITEST_MAX_FORKS`
 * is vitest's own knob and applies to every package at once, which is why it is set here rather
 * than copied into nine `vitest.config.ts` files — `docs/PROCESS.md` has four entries about a
 * second copy that goes stale silently.
 *
 * This is deliberately not `--concurrency=1`. Packages still overlap; what stops is each of them
 * sizing a pool as though it were alone on the host. It sizes itself from the host, so a 2-core CI
 * runner gets 2 × 1 and this machine gets 4 × 2.
 */
function parallelism() {
  const cpus = Math.max(1, cpuCount());
  const concurrency = Math.max(2, Math.floor(cpus / 2));
  const forks = Math.max(1, Math.floor(cpus / concurrency));
  return { concurrency, forks };
}

function turbo(name) {
  const before = Date.now();
  const { concurrency, forks } = parallelism();
  // Only `test` spawns worker pools; `lint` and `typecheck` are one process per package.
  //
  // **`VITEST_MAX_FORKS` has to be declared in `turbo.json`'s `globalPassThroughEnv` or setting it
  // here does nothing at all.** Declaring any pass-through list puts turbo in strict environment
  // mode, so a task sees only the names on it — a knob that is set, logged, and then filtered out
  // one process later. That is the shape of this epic's own §4.1 defect, and the reason the line
  // below prints the numbers: a run that says "4 × 2" and then spawns 71 processes is a run whose
  // own report can be checked against `ps`.
  if (name === "test") {
    process.env.VITEST_MAX_FORKS = String(forks);
    console.log(
      `  parallelism: ${concurrency} package(s) at a time × ${forks} vitest fork(s), ` +
        `on ${cpuCount()} core(s)`
    );
  }
  const result = run("npx", [
    "turbo", "run", name, "--continue", "--summarize", `--concurrency=${concurrency}`,
  ]);
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
// and a CI run are looking at the same configuration. They now live in `apps/web/e2e/env.mjs` and
// nowhere else in this file: they were written out twice here and once in `playwright.config.ts`
// had this stayed inline, and a copy goes stale silently.
if (task === "test") applyWhenUnset(process.env, placeholders());

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
