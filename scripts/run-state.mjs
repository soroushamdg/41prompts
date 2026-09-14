// The resume point for an unattended epic run: docs/epics/.run-state.json.
//
// The failure this exists to prevent is specific and real. The loop merges to main and then
// deploys, drives, reports and ticks. A run that dies after the merge and before the drive
// leaves finished work sitting on main — and a runner that starts the epic over reimplements
// it, on a branch, against a main that already has it. That is not a lost session; it is a
// conflicting duplicate of shipped code.
//
// So each step writes down that it finished, and the next invocation resumes at the step
// after the last one recorded. The file is deleted when the epic completes, which is what
// makes "a state file exists" mean "an epic is half-done" rather than "an epic once ran".
//
// The steps are AUTONOMOUS.md's loop, in order. They are listed here rather than in prose so
// the runner and the run agree on what "the next step" is.

import { readFileSync, writeFileSync, existsSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";

const REPO = process.env.AUTONOMOUS_REPO ?? process.cwd();
const STATE = join(REPO, "docs", "epics", ".run-state.json");

export const STEPS = [
  "epic-file",   // the epic file exists and says what is being built
  "plan",        // docs/epics/plan-EPIC-xxx.md written and read back
  "implement",   // the code is written
  "gates",       // test, typecheck, lint, compliance all green locally
  "local-drive", // the feature driven in a browser against the BUILT app, before pushing
  "push",        // branch pushed, PR opened
  "ci",          // CI green on the PR
  "merge",       // merged to main — records the PR number and the merge commit
  "deploy",      // staging has redeployed and is serving the merge commit
  "drive",       // the feature driven in a browser on the deployed URL
  "report",      // docs/epics/reports/ and docs/epics/sessions/ written
  "backlog"      // the epic's own status cell ticked — the one backlog edit that is allowed
];

function read() {
  if (!existsSync(STATE)) return null;
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch (err) {
    // A truncated state file is worse than none: it would resume at a step nobody reached.
    // Move it aside so the failure is visible rather than silently starting over.
    const aside = `${STATE}.corrupt`;
    renameSync(STATE, aside);
    process.stderr.write(`run-state: ${STATE} was unreadable (${err.message}); moved to ${aside}\n`);
    return null;
  }
}

// Written whole, every time. The file is small and a partial write here is the one thing
// that would make resume worse than restart.
function write(state) {
  state.updatedAt = new Date().toISOString();
  writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  return state;
}

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function nextStep(state) {
  if (!state?.lastStep) return STEPS[0];
  const i = STEPS.indexOf(state.lastStep);
  if (i === -1) return STEPS[0];
  return STEPS[i + 1] ?? null;
}

const command = process.argv[2];

switch (command) {
  case "get": {
    const state = read();
    if (!state) {
      if (process.argv.includes("--json")) process.stdout.write("null\n");
      process.exit(1);
    }
    if (process.argv.includes("--json")) {
      process.stdout.write(JSON.stringify({ ...state, nextStep: nextStep(state) }, null, 2) + "\n");
    } else if (process.argv.includes("--tsv")) {
      // One tab-separated line, for the shell to read with a single `read -r`. No field here
      // can contain a tab: the epic id, the branch and the steps are all constrained, and a
      // backlog title with a tab in it would already have broken the markdown table.
      process.stdout.write(
        [state.epic, state.title ?? "", state.stage ?? "", state.branch ?? "", state.lastStep ?? "", nextStep(state) ?? ""].join("\t") + "\n"
      );
    } else {
      process.stdout.write(
        `${state.epic} — last completed step: ${state.lastStep ?? "(none)"}, next: ${nextStep(state) ?? "(complete)"}\n`
      );
    }
    break;
  }

  case "start": {
    const epic = arg("epic");
    if (!epic) {
      process.stderr.write("run-state start: --epic is required\n");
      process.exit(2);
    }
    const existing = read();
    // Resuming is the default. `start` on an epic that already has state leaves the recorded
    // progress alone and only bumps the attempt count — otherwise the first thing a resumed
    // run would do is erase the reason it is resuming.
    if (existing && existing.epic === epic) {
      existing.attempts = (existing.attempts ?? 1) + 1;
      write(existing);
      process.stdout.write(`resuming ${epic} at step ${nextStep(existing)} (attempt ${existing.attempts})\n`);
      break;
    }
    if (existing && existing.epic !== epic) {
      process.stderr.write(
        `run-state start: state file is for ${existing.epic}, refusing to overwrite it with ${epic}\n`
      );
      process.exit(3);
    }
    const state = write({
      epic,
      title: arg("title", ""),
      stage: arg("stage", ""),
      branch: arg("branch", ""),
      lastStep: null,
      pr: null,
      mergeCommit: null,
      attempts: 1,
      startedAt: new Date().toISOString(),
      notes: []
    });
    process.stdout.write(`started ${state.epic} at step ${nextStep(state)}\n`);
    break;
  }

  case "set": {
    const state = read();
    if (!state) {
      process.stderr.write("run-state set: no state file — run `start` first\n");
      process.exit(2);
    }
    const step = arg("step");
    if (step && !STEPS.includes(step)) {
      process.stderr.write(`run-state set: unknown step "${step}". Known: ${STEPS.join(", ")}\n`);
      process.exit(2);
    }
    if (step) state.lastStep = step;
    const pr = arg("pr");
    if (pr) state.pr = Number(pr);
    const merge = arg("merge-commit");
    if (merge) state.mergeCommit = merge;
    const branch = arg("branch");
    if (branch) state.branch = branch;
    const note = arg("note");
    if (note) state.notes = [...(state.notes ?? []), { at: new Date().toISOString(), note }];
    write(state);
    process.stdout.write(`${state.epic}: recorded ${state.lastStep}, next is ${nextStep(state) ?? "(complete)"}\n`);
    break;
  }

  case "clear": {
    if (existsSync(STATE)) unlinkSync(STATE);
    process.stdout.write("run state cleared\n");
    break;
  }

  case "steps":
    process.stdout.write(STEPS.join("\n") + "\n");
    break;

  default:
    process.stderr.write("usage: run-state.mjs get|start|set|clear|steps [--json] [--epic X] [--step Y] [--pr N] [--merge-commit SHA] [--note TEXT]\n");
    process.exit(2);
}
