// Writes docs/epics/RELEASE-DUE.md: what production is missing, and what a tag would carry.
//
// It never tags. Production moves when Soroush decides it moves, and the whole point of this
// file is to put the decision in front of him with the evidence attached rather than to make
// it. `v*` is the only signal the project has for "we decided this is good enough for
// production" (PROCESS.md, "Tags are releases, not checkpoints"), and an unattended loop
// spending that signal would empty it of meaning.
//
// Production's commit comes from its own /healthz rather than from the newest tag, because
// the question is what is running, not what was last tagged — a tag whose deploy failed would
// otherwise read as shipped.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.env.AUTONOMOUS_REPO ?? process.cwd();
const OUT = join(REPO, "docs", "epics", "RELEASE-DUE.md");
const PROD_HEALTHZ = process.env.PRODUCTION_HEALTHZ ?? "https://app.41prompts.ai/healthz";

const git = (...args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();

let prodCommit = null;
let prodEnv = null;
try {
  const res = await fetch(PROD_HEALTHZ, { signal: AbortSignal.timeout(20000) });
  const body = await res.json();
  prodCommit = body.commit ?? null;
  prodEnv = body.env ?? null;
} catch (err) {
  process.stderr.write(`release-due: could not read ${PROD_HEALTHZ} (${err.message})\n`);
}

const latestTag = (() => {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v*");
  } catch {
    return null;
  }
})();

const mainHead = git("rev-parse", "main");

// A commit production has never heard of is not necessarily reachable from main — a failed
// deploy, a reverted tag. Fall back to the tag when the commit is not in this tree.
let base = prodCommit;
let baseSource = `production's live commit (from ${PROD_HEALTHZ})`;
try {
  if (base) git("cat-file", "-e", `${base}^{commit}`);
} catch {
  base = null;
}
if (!base && latestTag) {
  base = latestTag;
  baseSource = `the newest v* tag (production's live commit was unreadable or not in this tree)`;
}

const commits = base ? git("log", "--oneline", "--no-decorate", `${base}..${mainHead}`) : "";
const lines = commits ? commits.split("\n") : [];
const files = base ? git("diff", "--stat", `${base}..${mainHead}`).split("\n").slice(-1)[0] : "";

const nextTag = (() => {
  if (!latestTag) return "v0.1.0";
  const m = latestTag.match(/^v(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return `${latestTag}+1`;
  return `v${m[1]}.${Number(m[2]) + 1}.0`;
})();

const body = `# Release due

Written by \`scripts/run-epics.sh\` after three completed epics. **The loop has stopped and is
waiting for you.** Nothing here has been tagged and nothing will be: cutting the release is
yours.

Generated ${new Date().toISOString()}.

## Where the two environments are

| | commit | source |
|---|---|---|
| production | \`${prodCommit ?? "unknown"}\`${prodEnv ? ` (env=${prodEnv})` : ""} | ${PROD_HEALTHZ} |
| \`main\` | \`${mainHead}\` | this checkout |
| newest tag | ${latestTag ?? "(none)"} | \`git describe --tags\` |

Diff base: ${baseSource}.

## What a \`${nextTag}\` tag would carry

${lines.length} commit${lines.length === 1 ? "" : "s"}${files ? ` · ${files.trim()}` : ""}

${lines.length ? lines.map((l) => `- ${l}`).join("\n") : "_Nothing — production is level with `main`._"}

## To cut it

\`\`\`
git checkout main && git pull
git tag ${nextTag} && git push origin ${nextTag}
\`\`\`

That triggers \`build-images.yml\` (both images to GHCR) and Coolify's production deploy, and
\`deploy.yml\` creates the GitHub Release. Read \`infra/RUNBOOK.md\` first if this is a large
one — the 2026-09-13 incident is why the loop stops every three epics instead of letting the
gap grow.

## Then

Delete this file and restart the loop:

\`\`\`
rm docs/epics/RELEASE-DUE.md
scripts/run-epics.sh
\`\`\`
`;

writeFileSync(OUT, body);
process.stdout.write(`${OUT} written — ${lines.length} commit(s) ahead of production\n`);
