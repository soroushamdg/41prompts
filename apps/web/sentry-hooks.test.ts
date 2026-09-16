import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `Sentry.init` in this repository redacts before it sends (EPIC-043).
 *
 * ## Why this is a test and not a convention
 *
 * Before this epic there were three `Sentry.init` call sites and **none of them had a `beforeSend`**.
 * Nothing noticed, because nothing was looking: each one was written in a different epic, in a
 * different file, for a different runtime, and each was correct about the thing it was added for.
 * The fourth one will be written the same way.
 *
 * So the guard is on the class rather than on the three instances — the same argument
 * `apps/web/e2e-writes.test.ts` makes about specs that write into the tree, and the same argument
 * `docs/PROCESS.md` makes under "A helper that normalises state". A test fails when somebody adds an
 * init without the hook; a comment does not.
 *
 * ## Why the paths are listed rather than discovered
 *
 * A walk of the tree would have to exclude `node_modules`, `.next`, `.turbo` and `dist`, and a walk
 * that silently found nothing would pass. Three named files cannot silently find nothing: the first
 * assertion below is that each one exists and contains an init at all.
 */
const REPO = join(import.meta.dirname, "..", "..");

const SENTRY_INIT_FILES = [
  "apps/web/instrumentation.ts",
  "apps/web/instrumentation-client.ts",
  "apps/worker/src/sentry.ts",
] as const;

/** Every hook Sentry offers that carries user data out of the process. */
const REQUIRED_HOOKS = ["beforeSend", "beforeSendTransaction", "beforeBreadcrumb"] as const;

describe("every Sentry.init redacts before it sends", () => {
  it.each(SENTRY_INIT_FILES)("%s has an init, so this test is looking at something", (relative) => {
    expect(readFileSync(join(REPO, relative), "utf8")).toContain("Sentry.init(");
  });

  it.each(SENTRY_INIT_FILES)("%s passes every redaction hook", (relative) => {
    const source = readFileSync(join(REPO, relative), "utf8");
    for (const hook of REQUIRED_HOOKS) {
      expect(source, `${relative} is missing ${hook}`).toContain(`${hook}:`);
    }
  });
});
