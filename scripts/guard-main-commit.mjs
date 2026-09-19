// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary

/**
 * Refuse a commit on `main` unless it is the advisor's doc commit.
 *
 * ## Why this exists
 *
 * `CLAUDE.md` and `docs/PROCESS.md` both say one epic, one branch, one PR. The rule was still broken
 * twice in a single session (EPIC-021a), both times at the same moment: immediately after a
 * `git checkout main` following a merge, when the next piece of work starts on a tree that happens
 * to be sitting on `main`. Nothing was pushed either time, but "nothing was pushed" is luck, and a
 * rule that depends on remembering at exactly the wrong moment is not a rule.
 *
 * ## Why `commit-msg` and not `pre-commit`
 *
 * **`pre-commit` cannot see the commit message.** Git passes the message file only to
 * `prepare-commit-msg` and `commit-msg`; by `pre-commit` it does not exist yet. This rule needs both
 * halves — the message *and* the staged paths — so it has to be one hook, and `commit-msg` is the
 * earliest one that has both. The staged files are still readable there.
 *
 * ## The one legitimate case
 *
 * The advisor commits epics, the backlog and reviews straight to `main`; those are documentation and
 * belong to nobody's branch. So a commit is allowed on `main` when **both** hold:
 *
 * 1. the subject line starts with `docs:`, and
 * 2. every staged path is under `docs/`.
 *
 * Both, not either. "docs: ..." on a commit that also touches `packages/` is exactly the kind of
 * thing this is meant to stop, and a doc-only commit called `chore:` is still a commit on `main`
 * that should have said what it was.
 *
 * ## It is not a wall
 *
 * `git commit --no-verify` bypasses it, as it bypasses every hook. That is deliberate: a guard that
 * cannot be overridden gets uninstalled the first time it is wrong, taking the rule with it. This
 * exists to make the mistake *loud*, not impossible.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROTECTED_BRANCH = "main";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function currentBranch() {
  try {
    return git("rev-parse", "--abbrev-ref", "HEAD");
  } catch {
    // Detached HEAD, or not a work tree. Nothing to protect.
    return "";
  }
}

/**
 * A rebase, merge, cherry-pick or bisect in progress.
 *
 * Those replay commits that were already reviewed on a branch, and blocking them would break
 * `git rebase main` in a way whose error message points at the wrong thing entirely.
 */
function midOperation() {
  try {
    const gitDir = git("rev-parse", "--git-path", "");
    return ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD", "BISECT_LOG"].some((marker) => {
      try {
        execFileSync("test", ["-e", `${gitDir}/${marker}`]);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

const messageFile = process.argv[2];
if (messageFile === undefined) {
  // Invoked by hand with no argument; nothing to check.
  process.exit(0);
}

if (currentBranch() !== PROTECTED_BRANCH || midOperation()) {
  process.exit(0);
}

// Comment lines are git's own template, not the author's message.
const subject = readFileSync(messageFile, "utf8")
  .split("\n")
  .find((line) => line.trim() !== "" && !line.startsWith("#"))
  ?.trim();

const staged = git("diff", "--cached", "--name-only")
  .split("\n")
  .filter((path) => path !== "");

if (staged.length === 0) {
  process.exit(0);
}

const subjectIsDocs = subject?.startsWith("docs:") === true;
const outsideDocs = staged.filter((path) => !path.startsWith("docs/"));

if (subjectIsDocs && outsideDocs.length === 0) {
  process.exit(0);
}

const reasons = [];
if (!subjectIsDocs) {
  reasons.push(`  · the subject does not start with "docs:" — it is ${JSON.stringify(subject ?? "")}`);
}
if (outsideDocs.length > 0) {
  const shown = outsideDocs.slice(0, 8);
  reasons.push(`  · ${outsideDocs.length} staged path(s) are outside docs/:`);
  for (const path of shown) reasons.push(`      ${path}`);
  if (outsideDocs.length > shown.length) reasons.push(`      … and ${outsideDocs.length - shown.length} more`);
}

process.stderr.write(
  [
    "",
    `Refused: this is a commit on ${PROTECTED_BRANCH}.`,
    "",
    "One epic, one branch, one PR (CLAUDE.md, docs/PROCESS.md). The only commits allowed straight",
    'on main are the advisor\'s documentation ones: subject starting "docs:" AND every path under docs/.',
    "",
    ...reasons,
    "",
    "Move it to a branch — the commit is still staged, nothing is lost:",
    "",
    "    git switch -c <branch-name>",
    "    git commit            # re-run, it will pass there",
    "",
    "If this guard is wrong for what you are doing, `git commit --no-verify` goes past it.",
    "",
  ].join("\n")
);
process.exit(1);
