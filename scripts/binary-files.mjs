#!/usr/bin/env node
// Fails when a source file under `packages/` or `apps/` is one git considers binary — tracked,
// staged, or merely present and not ignored.
//
// This exists because of a specific failure, not a hypothetical one. A generator script wrote a
// literal NUL byte into `packages/core/src/cluster/cluster.ts` during EPIC-011a. Git decides a file
// is binary by sniffing for a NUL in its first 8000 bytes, and a file it calls binary shows **no
// diff at all** — so that file was invisible to two self-reviews, and both of them reported coverage
// they did not have. Nothing was wrong with the code; the hole was in the review.
//
// `.gitattributes` is the other half: it forces a textual diff for source extensions, so even a file
// that does contain a NUL still shows up in review. This check is what fails the build so the NUL
// gets removed rather than merely rendered.
import { execFileSync } from "node:child_process";
import { extname } from "node:path";
import { openSync, readSync, closeSync } from "node:fs";

/**
 * Every tree whose text files are read by a person.
 *
 * **`docs/`, `sdks/` and `scripts/` joined in EPIC-055, and the reason is that the gap was real.**
 * The roots were `packages` and `apps`; on 2026-09-17 a scan of every tracked file found a literal
 * NUL byte in `docs/epics/reports/EPIC-052-report.md` and another in the matching session log —
 * both in the sentence describing the lesson about a NUL byte reaching a source file.
 *
 * Nothing caught them, because nothing was looking there. `.gitattributes` did its half (`*.md diff`
 * keeps the textual diff visible, so the review hole stayed closed) and this script is the other
 * half — the one that makes the byte get **removed** rather than merely rendered.
 *
 * The cost of not covering `docs/` is not cosmetic. `git` classes such a file as binary, and `grep`
 * then silently finds nothing in it: a session grepping EPIC-052's report for a lesson gets an empty
 * result that looks exactly like an absence. That is `docs/epics/HANDOVER.md`'s lesson 20 — a search
 * that cannot fire reads exactly like a search that found nothing — arriving through the reports
 * that record it.
 *
 * Lesson 19, verbatim: **a gate only guards what it is pointed at.** Before trusting this script
 * about a new area, check that the area is in this array.
 */
const ROOTS = ["packages", "apps", "docs", "sdks", "scripts"];

/**
 * Git's own heuristic window: it decides a file is binary by looking for a NUL in the first 8000
 * bytes and no further.
 *
 * **This script scans the whole file, and the window is now only used to say how bad it is.** The
 * two harms have different thresholds and EPIC-055 found one of each:
 *
 * - `docs/epics/sessions/EPIC-052-session.md`, NUL at byte 5,755 — **inside** the window, so git
 *   calls the file binary and shows no diff for it at all.
 * - `docs/epics/reports/EPIC-052-report.md`, NUL at byte 12,411 — **outside** it, so `git diff`
 *   works perfectly and the file looks fine. `grep` does not have a window: it reads the whole file,
 *   finds the byte, and then silently reports nothing. `grep -c '^#'` on that report returns 0 and
 *   exits 1, for a document full of Markdown headings.
 *
 * Scanning only the window would have passed the second file while its own subject — lesson 20, a
 * search that cannot fire reads exactly like a search that found nothing — was happening to it.
 */
const SNIFF_BYTES = 8000;

// Extensions where being binary is the point. Everything else is a defect.
const ALLOWED_BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".zip", ".gz", ".tgz", ".br", ".wasm", ".node"
]);

function gitPaths(args) {
  const out = execFileSync("git", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter((path) => path.length > 0);
}

/**
 * Every file this check should judge: tracked, staged, and untracked-but-not-ignored.
 *
 * **It used to be `git ls-files` only, and the gap was narrower than it first looked — which is worth
 * stating precisely rather than overselling the fix.** `ls-files` reads the index, so a *staged* new
 * file was already covered. What it could not see was a file that existed and had not been staged
 * yet.
 *
 * That is the ordinary case. You write a file, run the gate, and see green — then stage and commit,
 * and CI fails. Exactly what happened to `apps/worker/src/runs/execute.ts` in EPIC-031: three raw
 * NUL bytes, a local `binary-files` reporting `486 checked` and nothing else, and a red build on the
 * merge. The old gate would have caught it if it had been run after `git add`, which is not when
 * anybody runs it.
 *
 * Every epic adds new files, so the blind spot covered precisely the moment a NUL is most likely to
 * be introduced.
 *
 * It matters more than the inconvenience: an unattended run that merges on a local green needs the
 * local green to mean what CI's means. A gate that is weaker locally than remotely is not a gate,
 * it is a delay.
 *
 * Three sources, unioned and deduplicated:
 *
 * - `ls-files` — tracked, the original behaviour.
 * - `diff --cached` — staged, including a file added in this commit that git does not yet track.
 *   `--diff-filter=ACMR` skips deletions, which have nothing on disk to read.
 * - `ls-files --others --exclude-standard` — present, not ignored. `--exclude-standard` is what
 *   keeps `node_modules` and `dist` out without this script maintaining its own ignore list.
 */
function filesToCheck() {
  const tracked = gitPaths(["ls-files", "-z", "--", ...ROOTS]);
  const staged = gitPaths(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR", "--", ...ROOTS]);
  const untracked = gitPaths(["ls-files", "-z", "--others", "--exclude-standard", "--", ...ROOTS]);
  return [...new Set([...tracked, ...staged, ...untracked])].sort();
}

/** The offset of the first NUL byte anywhere in the file, or -1. */
function firstNulByte(path) {
  let handle;
  try {
    handle = openSync(path, "r");
  } catch {
    return -1; // deleted or unreadable in the working tree; nothing to judge
  }
  try {
    // Read in chunks rather than slurping: `docs/` now contains this script's own inputs and a
    // report can be large. The offset is absolute so the message can compare it with SNIFF_BYTES.
    const buffer = Buffer.alloc(64 * 1024);
    let position = 0;
    for (;;) {
      const read = readSync(handle, buffer, 0, buffer.length, position);
      if (read === 0) return -1;
      const found = buffer.subarray(0, read).indexOf(0);
      if (found >= 0) return position + found;
      position += read;
    }
  } finally {
    closeSync(handle);
  }
}

const violations = [];
let checked = 0;

for (const path of filesToCheck()) {
  if (ALLOWED_BINARY.has(extname(path).toLowerCase())) continue;
  checked += 1;
  const offset = firstNulByte(path);
  if (offset >= 0) violations.push({ path, offset });
}

if (violations.length > 0) {
  console.error(`A text file contains a NUL byte:\n`);
  for (const { path, offset } of violations) {
    const invisible = offset < SNIFF_BYTES;
    console.error(
      `  ${path}: first NUL at byte ${offset}` +
        (invisible
          ? " — inside git's 8000-byte window, so git shows NO DIFF for this file"
          : " — outside git's window, so git diffs it, but grep silently finds nothing in it")
    );
  }
  console.error(
    "\nGit shows no diff for a file it considers binary, so such a file is invisible in review —" +
      "\nwhich is exactly how packages/core/src/cluster/cluster.ts went unreviewed for two epics." +
      "\nA NUL past that window is quieter and not harmless: grep reads the whole file, decides it is" +
      "\nbinary, and reports nothing — indistinguishable from a search that found nothing." +
      "\n\nIf the byte is meant to be there, write it as an escape (\\u0000) rather than a raw byte." +
      "\nIf the file is genuinely binary, add its extension to ALLOWED_BINARY in this script and say why."
  );
  process.exit(1);
}

console.log(
  `No text file under ${ROOTS.join(", ")} contains a NUL byte ` +
    `(${checked} checked in full, including staged and untracked).`
);
