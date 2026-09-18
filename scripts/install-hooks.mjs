// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Point git at the repo's committed hooks.
 *
 * `core.hooksPath` is local config, not something a checkout carries, so the hooks in `.githooks/`
 * do nothing until this runs. It is wired to `prepare`, which pnpm runs after `pnpm install` — so a
 * fresh clone gets the guard without anybody being told to run anything.
 *
 * **It never fails an install**, in three different ways, because a missing hook is a missing guard
 * and not a broken build:
 *
 * - A Docker build copies the source without `.git`, and CI checks out shallow — handled below.
 * - `git config` can fail on a worktree that does not want it — caught below.
 * - **The file itself can be absent.** `scripts/` is deliberately excluded from the public mirror
 *   (`scripts/mirror-dry-run.sh` asserts it is not there), while the root `package.json` *is*
 *   copied — so in the mirror `prepare` names a file that cannot exist. That is why the script is
 *   invoked as `node scripts/install-hooks.mjs || true`: nothing inside this file can catch its own
 *   absence. Found by `pnpm compliance` failing the first time this was wired up.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (!existsSync(join(root, ".git"))) {
  process.exit(0);
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root, stdio: "ignore" });
} catch {
  // No git, or a worktree that does not want it. Not worth failing an install over.
}
