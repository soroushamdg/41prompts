import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyWhenUnset,
  missingRequired,
  placeholders,
  refusalLines,
  REQUIRED
} from "./e2e/env.mjs";

/**
 * **`pnpm e2e` in a fresh shell used to fail eleven tests and say nothing about why.**
 *
 * Nothing loads the root `.env` into a Node process, so the app started with no
 * `BETTER_AUTH_SECRET`, every magic-link sign-in returned `Something went wrong.`, and the three
 * serial suites cascaded off it. `gates.mjs` had the placeholders that fix it and applied them only
 * to its own gates. Measured 2026-09-14: `auth.spec.ts` went 8 failed → 10 passed with only those
 * values added.
 *
 * It is worse than an annoyance, which is why it is guarded rather than just fixed: the unattended
 * runner reads an unexplained failure as a blocker and stops, so this defect parked the loop on its
 * first epic.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the placeholders the e2e suite fills in", () => {
  it("covers everything Better Auth needs to construct itself", () => {
    // Not a restatement of the object: these are the names whose absence produced the eleven
    // failures, so losing any one of them silently brings the defect back.
    expect(Object.keys(placeholders())).toEqual(
      expect.arrayContaining([
        "DEPLOY_ENV",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET"
      ])
    );
  });

  it("derives the auth URL from the port, because a mismatch is refused by Better Auth", () => {
    // `.env` saying :3000 while `E2E_PORT` said 3100 is what made every sign-in fail silently across
    // EPIC-014 to EPIC-016, reported as "pre-existing" three times.
    expect(placeholders(3100).BETTER_AUTH_URL).toBe("http://localhost:3100");
    expect(placeholders().BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  /**
   * **The copy that cannot import this module.** `ci.yml` is YAML read by GitHub, so its values are
   * written out by hand; if the two drift, a local run and a CI run stop looking at the same
   * configuration, which is the difference this whole file exists to remove.
   */
  it("still matches .github/workflows/ci.yml, which cannot import them", () => {
    const workflow = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf-8");
    for (const [key, value] of Object.entries(placeholders())) {
      expect(workflow, `ci.yml must still set ${key}: ${value}`).toMatch(
        new RegExp(`^\\s*${key}:\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m")
      );
    }
  });
});

describe("filling a gap never takes a decision away", () => {
  it("sets only what is unset, and says which", () => {
    const env: Record<string, string> = { DEPLOY_ENV: "staging" };
    const applied = applyWhenUnset(env, { DEPLOY_ENV: "development", BETTER_AUTH_SECRET: "x" });
    expect(env.DEPLOY_ENV).toBe("staging");
    expect(env.BETTER_AUTH_SECRET).toBe("x");
    expect(applied).toEqual(["BETTER_AUTH_SECRET"]);
  });

  it("treats an empty string as unset, because `.env` files are full of them", () => {
    const env: Record<string, string> = { BETTER_AUTH_SECRET: "" };
    expect(applyWhenUnset(env, { BETTER_AUTH_SECRET: "filled" })).toEqual(["BETTER_AUTH_SECRET"]);
    expect(env.BETTER_AUTH_SECRET).toBe("filled");
  });

  it("reports nothing applied when the environment is already complete", () => {
    const env = { ...placeholders(3100) };
    expect(applyWhenUnset(env, placeholders(3100))).toEqual([]);
  });
});

describe("what cannot be invented is refused by name", () => {
  it("names DATABASE_URL and nothing else", () => {
    // A signing secret can be invented because nothing verifies it. A database URL cannot: a made-up
    // one moves the failure somewhere further from its cause, which is the defect, not the fix.
    expect(REQUIRED.map((entry) => entry.name)).toEqual(["DATABASE_URL"]);
  });

  it("finds it missing when unset or empty, and satisfied otherwise", () => {
    expect(missingRequired({}).map((entry) => entry.name)).toEqual(["DATABASE_URL"]);
    expect(missingRequired({ DATABASE_URL: "" }).map((entry) => entry.name)).toEqual(["DATABASE_URL"]);
    expect(missingRequired({ DATABASE_URL: "postgres://x" })).toEqual([]);
  });

  it("prints the name, the reason and a command that fixes it", () => {
    const printed = refusalLines(missingRequired({})).join("\n");
    expect(printed).toContain("DATABASE_URL is not set");
    expect(printed).toContain("verifications table");
    expect(printed).toContain("node scripts/gates.mjs ci");
  });
});
