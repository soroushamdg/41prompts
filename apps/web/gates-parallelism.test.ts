import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **The gate's parallelism budget, and the one thing that silently removes it.**
 *
 * ## Why this exists
 *
 * `scripts/gates.mjs` caps how much work a test run puts on the machine: `turbo run --concurrency`
 * for how many packages go at once, and `VITEST_MAX_FORKS` for how many workers each of them
 * spawns. Without it, nine packages each size a vitest fork pool to the host and turbo schedules ten
 * tasks — **71 concurrent processes and a load average of 262 on 8 cores**, measured on 2026-09-17
 * by sampling `ps` during one `pnpm test`. Every unexplained `Test timed out in 5000ms` in this
 * repository was that, including a sixty-second `onTaskUpdate` RPC in a package that reported 581 of
 * 581 tests passed.
 *
 * ## The failure this guards, which is not the cap being deleted
 *
 * `turbo.json` declares `globalPassThroughEnv`. **Declaring any pass-through list puts turbo in
 * strict environment mode**, so a task sees only the names on that list and nothing else. An
 * environment variable `gates.mjs` sets and `turbo.json` does not declare is therefore set, logged,
 * and filtered out one process later — the gate prints a number it is not achieving, and the run
 * goes back to 71 processes while reporting 4 x 2.
 *
 * That is EPIC-054 §4.1's defect exactly — a documented instruction that does nothing — and it
 * would arrive here in the tool whose job is to catch defects. A human dropping one name from a
 * twenty-name JSON array is a very ordinary edit; nothing about it looks like turning a gate off.
 *
 * So the two files are pinned to each other rather than trusted to agree. `apps/web/e2e-env.test.ts`
 * pins `ci.yml`'s literal to `apps/web/e2e/env.mjs` for the same reason and after the same kind of
 * afternoon.
 */

const GATES = fileURLToPath(new URL("../../scripts/gates.mjs", import.meta.url));
const TURBO = fileURLToPath(new URL("../../turbo.json", import.meta.url));

const gatesSource = () => readFileSync(GATES, "utf-8");
const passThrough = (): string[] =>
  (JSON.parse(readFileSync(TURBO, "utf-8")) as { globalPassThroughEnv?: string[] })
    .globalPassThroughEnv ?? [];

/**
 * Every `process.env.NAME = ...` assignment in `gates.mjs`, read out of the source rather than
 * listed here. A list here would be the second copy this test exists to prevent.
 */
function environmentNamesGatesSets(source: string): string[] {
  return [...source.matchAll(/process\.env\.([A-Z0-9_]+)\s*=/g)].map((m) => m[1]);
}

describe("the gate's parallelism budget reaches the process that has to honour it", () => {
  it("sets an environment variable to cap vitest's workers", () => {
    // The cap existing at all. If this fails, the rest of the file is asserting about nothing.
    expect(environmentNamesGatesSets(gatesSource())).toContain("VITEST_MAX_FORKS");
  });

  it("declares every environment variable it sets in turbo.json's pass-through list", () => {
    const declared = passThrough();
    const undeclared = environmentNamesGatesSets(gatesSource()).filter((n) => !declared.includes(n));
    expect(
      undeclared,
      `gates.mjs sets ${undeclared.join(", ")}, which turbo's strict environment mode will filter ` +
        "out before any task sees it. Add the name to globalPassThroughEnv in turbo.json."
    ).toEqual([]);
  });

  it("— and the same check fails on a name that is not declared", () => {
    // The positive control. Widening a list and watching a test stay green proves nothing: green is
    // also what a check that compares two empty sets prints.
    const declared = passThrough();
    const undeclared = environmentNamesGatesSets(
      `${gatesSource()}\nprocess.env.FORTYONE_NOT_DECLARED = "1";`
    ).filter((n) => !declared.includes(n));
    expect(undeclared).toEqual(["FORTYONE_NOT_DECLARED"]);
  });

  it("caps turbo's own task concurrency as well as vitest's workers", () => {
    // Capping the forks alone leaves ten packages starting at once, each with its own main process
    // and its own Postgres connections. Both halves or neither.
    expect(gatesSource()).toContain("--concurrency=");
  });

  it("sizes itself from the host rather than from a number written down once", () => {
    // A hardcoded 4 x 2 is right for this machine and wrong for a two-core runner, where it would be
    // the oversubscription this fix removes.
    expect(gatesSource()).toContain("availableParallelism");
  });
});
