import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONNECT_STEPS, TELEMETRY_HEADER_EXAMPLE, TELEMETRY_NOTE } from "./steps";

/**
 * The Connect page's snippets are `packages/sdk-ts/README.md`'s (EPIC-055 C8, ruling 4).
 *
 * EPIC-052's handover: *"`packages/sdk-ts/README.md` is now the canonical copy of the Connect page's
 * TypeScript steps, including the exact telemetry header. They must agree, and the README is the one
 * that goes to npm."*
 *
 * `apps/web` may not **import** a public package's source — `CLAUDE.md` rule 11 runs the other way —
 * so this reads the file. That is the same shape `apps/web/e2e-env.test.ts` uses to pin `ci.yml`'s
 * literal block to `apps/web/e2e/env.mjs`, and for the same reason: the failure mode of two copies
 * is not that they differ loudly, it is that one of them quietly stops being true.
 *
 * **Direction matters.** The README is the source and the page is the reader. A snippet the page
 * shows must be in the README; a README that grows a section the page does not show is fine.
 */

const README = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/sdk-ts/README.md");

function readme(): string {
  return readFileSync(README, "utf-8");
}

describe("the Connect page's steps are the SDK README's", () => {
  it("finds the README at all", () => {
    // Without this the whole suite is an assertion about an empty string, and every `toContain`
    // below would fail for a reason that has nothing to do with drift. Lesson 8, at the top.
    expect(readme().length).toBeGreaterThan(1000);
    expect(readme()).toContain("# @41prompts/sdk");
  });

  it.each(CONNECT_STEPS.map((step) => [step.slug, step] as const))("step %s is in the README", (_slug, step) => {
    for (const fragment of step.readmeMustContain) {
      expect(readme()).toContain(fragment);
    }
  });

  it("prints the telemetry header exactly as the README does", () => {
    expect(readme()).toContain(TELEMETRY_HEADER_EXAMPLE);
    for (const fragment of TELEMETRY_NOTE.readmeMustContain) {
      expect(readme()).toContain(fragment);
    }
  });

  /**
   * The control (`CLAUDE.md`'s "every absence assertion needs a positive control", four epics
   * running).
   *
   * Everything above is `expect(readme()).toContain(x)` — it passes when the page and the README
   * agree **and** it would pass if `toContain` were somehow always true. This proves the matcher
   * can fail: a snippet altered by one character is not found.
   */
  it("fails on a snippet that has drifted — so the assertions above can fail", () => {
    const text = readme();
    for (const step of CONNECT_STEPS) {
      for (const fragment of step.readmeMustContain) {
        const drifted = `${fragment}-drifted`;
        expect(text).not.toContain(drifted);
      }
    }
    // And the sharper version: mutate the *README* rather than the snippet, which is the direction
    // drift actually travels — somebody edits the published document and the page keeps its copy.
    // `replaceAll`, not `replace`. The README says this twice, and with `replace` the assertion
    // below passed for the wrong reason on the first run — the control needing its own control.
    const edited = text.replaceAll("npm install @41prompts/sdk", "npm install @41prompts/client");
    expect(edited).not.toContain("npm install @41prompts/sdk");
    expect(text).toContain("npm install @41prompts/sdk");
  });

  it("every step declares at least one thing to pin", () => {
    // A step with an empty `readmeMustContain` passes the loop above vacuously, which is a step
    // silently outside the gate — the EPIC-052 lesson about roots, at the level of one array.
    for (const step of CONNECT_STEPS) {
      expect(step.readmeMustContain.length).toBeGreaterThan(0);
    }
  });
});
