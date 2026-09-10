#!/usr/bin/env node
// Fails when a tracked source file under `packages/` or `apps/` is one git considers binary.
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

// The roots the advisor named. `sdks/` and `scripts/` are not covered; widening is one line here.
const ROOTS = ["packages", "apps"];

// Git's own heuristic: it only sniffs the first 8000 bytes.
const SNIFF_BYTES = 8000;

// Extensions where being binary is the point. Everything else is a defect.
const ALLOWED_BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".ico", ".bmp",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".zip", ".gz", ".tgz", ".br", ".wasm", ".node"
]);

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...ROOTS], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\0").filter((path) => path.length > 0);
}

/** The offset of the first NUL byte within git's sniff window, or -1. */
function firstNulByte(path) {
  let handle;
  try {
    handle = openSync(path, "r");
  } catch {
    return -1; // deleted or unreadable in the working tree; nothing to judge
  }
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const read = readSync(handle, buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, read).indexOf(0);
  } finally {
    closeSync(handle);
  }
}

const violations = [];
let checked = 0;

for (const path of trackedFiles()) {
  if (ALLOWED_BINARY.has(extname(path).toLowerCase())) continue;
  checked += 1;
  const offset = firstNulByte(path);
  if (offset >= 0) violations.push({ path, offset });
}

if (violations.length > 0) {
  console.error(`A tracked source file contains a NUL byte, which makes git treat it as binary:\n`);
  for (const { path, offset } of violations) {
    console.error(`  ${path}: first NUL at byte ${offset}`);
  }
  console.error(
    "\nGit shows no diff for a file it considers binary, so this file would be invisible in review —" +
      "\nwhich is exactly how packages/core/src/cluster/cluster.ts went unreviewed for two epics." +
      "\n\nIf the byte is meant to be there, write it as an escape (\\u0000) rather than a raw byte." +
      "\nIf the file is genuinely binary, add its extension to ALLOWED_BINARY in this script and say why."
  );
  process.exit(1);
}

console.log(`No tracked source file under ${ROOTS.join(", ")} is binary (${checked} checked).`);
