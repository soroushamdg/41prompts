// Run the local gate the way the repository currently defines it — by asking
// `scripts/gates.mjs` what it can do, never by carrying a list of gate commands here.
//
// ## Why this indirection exists
//
// The unattended runner has a gate step, and the obvious way to write it is four lines:
// `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`. That list is a copy of a
// decision that lives somewhere else, and a copy goes stale silently: the day `gates.mjs`
// learns to reproduce CI exactly — clean checkout, frozen lockfile, cold cache — a hardcoded
// list keeps running the old, weaker thing and reports it as a pass.
//
// So the gate is resolved at run time from what `gates.mjs` advertises about itself:
//
//   1. `gates.mjs` is asked, with a token it must reject, what modes it accepts. It answers
//      with its own usage line — `usage: node scripts/gates.mjs <test|typecheck|lint>` — which
//      is the tool declaring its accepted set rather than this file guessing at one. The probe
//      is guaranteed to do no work, because the token cannot be a real mode.
//   2. If a CI-parity mode is advertised, that is used **and it is used alone**, because a mode
//      claiming parity with CI covers what CI covers.
//   3. Otherwise every advertised mode runs, and `pnpm compliance` runs after them — today
//      `gates.mjs` does not carry `reuse`, `license-gate`, `binary-files` or `mirror-dry-run`,
//      and dropping them silently is exactly the failure this file exists to avoid.
//
// Nothing here needs editing when the parity mode lands. It will appear in the usage line and
// step 2 will take it, and the run log will say so by name.
//
//   node scripts/gate-run.mjs             run the gate
//   node scripts/gate-run.mjs --explain   print the resolved plan and why, run nothing
//
// `AUTONOMOUS_GATE_MODE` overrides the resolution entirely — for example `--ci`, or
// `ci`, or a space-separated argument list. Use it to pin a mode; it is not a way to skip one.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const GATES = "scripts/gates.mjs";
// Cannot be a mode, cannot be a flag anyone would add, so `gates.mjs` must reject it and
// print its usage rather than running a gate.
const PROBE = "--gate-run-capability-probe";

// The three that exist today. Anything else in the usage line is something that was added
// after this file was written, which is the whole point.
const KNOWN = ["test", "typecheck", "lint"];
// Names and flags that mean "this reproduces CI". Matched case-insensitively.
const PARITY = /^(--)?(ci|ci-parity|parity|ci-exact|full)$/i;

const explain = process.argv.includes("--explain");

function capture(args) {
  const r = spawnSync(process.execPath, [GATES, ...args], { encoding: "utf-8" });
  return `${r.stdout ?? ""}${r.stderr ?? ""}`;
}

// Read both shapes out of whatever help or usage text comes back: the `<a|b|c>` alternation
// that `gates.mjs` prints today, and long flags, in case the parity mode arrives as one.
function advertised(text) {
  const positional = [];
  for (const group of text.matchAll(/<([a-z0-9|_-]+)>/gi)) {
    for (const name of group[1].split("|")) {
      const trimmed = name.trim();
      if (trimmed && !positional.includes(trimmed)) positional.push(trimmed);
    }
  }
  const flags = [];
  // A usage line brackets an optional flag — `<test|typecheck|lint> [--ci]` — so the character
  // before it is as likely to be `[` as a space. Anything but a word character will do; the
  // guard is only there to avoid matching a `--` inside a longer token.
  for (const m of text.matchAll(/(^|[^\w-])(--[a-z][a-z0-9-]{1,30})/gi)) {
    const flag = m[2];
    if (flag !== PROBE && !flags.includes(flag)) flags.push(flag);
  }
  return { positional, flags };
}

function resolve() {
  const override = (process.env.AUTONOMOUS_GATE_MODE ?? "").trim();
  if (override) {
    return {
      steps: [{ label: `gates.mjs ${override}`, cmd: process.execPath, args: [GATES, ...override.split(/\s+/)] }],
      why: `AUTONOMOUS_GATE_MODE=${override} pins the mode`,
      parity: true
    };
  }

  // `--help` first, because a future gates.mjs may answer it properly; the probe token as the
  // fallback, because today's rejects everything it does not know and prints its usage.
  let text = capture(["--help"]);
  let modes = advertised(text);
  if (modes.positional.length === 0 && modes.flags.length === 0) {
    text = capture([PROBE]);
    modes = advertised(text);
  }

  if (modes.positional.length === 0 && modes.flags.length === 0) {
    // gates.mjs said nothing about itself. Do not invent a gate: say so and fail, rather than
    // run a weaker check and report it as the gate.
    return { steps: null, why: `${GATES} advertised no modes; its output was: ${text.trim().slice(0, 200)}` };
  }

  const parityMode =
    modes.flags.find((f) => PARITY.test(f)) ?? modes.positional.find((p) => PARITY.test(p)) ?? null;
  if (parityMode) {
    return {
      steps: [{ label: `gates.mjs ${parityMode}`, cmd: process.execPath, args: [GATES, parityMode] }],
      why: `${GATES} advertises ${parityMode}, which reproduces CI, so it runs alone`,
      parity: true
    };
  }

  const added = modes.positional.filter((p) => !KNOWN.includes(p));
  if (added.length === 1) {
    return {
      steps: [{ label: `gates.mjs ${added[0]}`, cmd: process.execPath, args: [GATES, added[0]] }],
      why: `${GATES} advertises one mode this runner did not know about (${added[0]}), so it is used`,
      parity: true
    };
  }

  const steps = modes.positional.map((mode) => ({
    label: `gates.mjs ${mode}`,
    cmd: process.execPath,
    args: [GATES, mode]
  }));
  // Only while gates.mjs does not claim CI parity. A parity mode above returns before here.
  steps.push({ label: "pnpm compliance", cmd: "pnpm", args: ["-s", "compliance"] });
  return {
    steps,
    why:
      added.length > 1
        ? `${GATES} advertises several unfamiliar modes (${added.join(", ")}); every advertised mode runs, plus compliance`
        : `${GATES} advertises no CI-parity mode, so every advertised mode runs, plus compliance, which it does not yet cover`,
    parity: false
  };
}

const plan = resolve();

if (!plan.steps) {
  process.stderr.write(`gate-run: ${plan.why}\n`);
  process.exit(2);
}

process.stdout.write(`gate: ${plan.why}\n`);
for (const step of plan.steps) process.stdout.write(`  will run: ${step.label}\n`);

if (explain) process.exit(0);

// Checked here rather than earlier, because `--explain` resolves a plan without running one and
// has no need of an installed tree.
//
// An uninstalled tree fails the gate for a reason that has nothing to do with the code, and says
// so in the language of gate failures: `@41prompts/core FAIL`, `depcruise: command not found`,
// "4 step(s) failed". That is the same ambiguity `gates.mjs` removed for the database — "no
// database here" is not "this code is broken" — so it gets the same treatment: named where it
// happens, with an exit code that is not "the gate failed".
if (!existsSync("node_modules") || !existsSync("node_modules/.bin")) {
  process.stderr.write(
    "gate-run: node_modules is missing, so this would fail on absent binaries rather than on the code.\n" +
      "          Run `pnpm install` first. The gate has not run.\n"
  );
  process.exit(2);
}

let failed = 0;
for (const step of plan.steps) {
  process.stdout.write(`\n=== ${step.label} ===\n`);
  const r = spawnSync(step.cmd, step.args, { stdio: "inherit" });
  if (r.status !== 0) {
    failed += 1;
    process.stdout.write(`${step.label} FAILED (exit ${r.status})\n`);
  }
}

process.stdout.write(failed === 0 ? "\ngate: all green\n" : `\ngate: ${failed} step(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
