import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_CLAIMS, CLAIMS, claim, type Claim } from "./claims";
// The denylist moved to its own module in EPIC-016b so the home page could read the same one —
// `not-true-yet.ts` carries the argument.
import { NOT_TRUE_YET, NOT_TRUE_YET_CONTROLS } from "./not-true-yet";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * EPIC-072's Review line — *"every claim maps to a shipped epic"* — as a test rather than as a
 * sentence in a report.
 *
 * A report says the audit was done on the day it was written. This says it on every run, which is
 * the difference that matters the first time somebody edits a page six months from now.
 *
 * **Every assertion about an absence here carries a positive control**, per `CLAUDE.md` and
 * `docs/PROCESS.md` lesson 8: three of EPIC-043's absence assertions could never have failed, and
 * each of them read as a green tick over a claim nobody had tested.
 */

describe("every claim names an epic that shipped", () => {
  it.each(ALL_CLAIMS.map((entry) => [entry.id, entry] as const))(
    "%s cites an epic with a report",
    (_id, entry: Claim) => {
      const report = join(REPO_ROOT, "docs", "epics", "reports", `${entry.epic}-report.md`);
      expect(existsSync(report), `${entry.id} cites ${entry.epic}, which has no report`).toBe(true);
    }
  );

  /**
   * The control. Everything above is `existsSync(...) === true`, which passes when the registry is
   * honest and would also pass if the path were being built wrong and happened to point at
   * something real. This is the shape of an epic id that did not ship.
   */
  it.each(["EPIC-999", "EPIC-070", "EPIC-060"])("would fail on %s, which has no report", (epic) => {
    expect(existsSync(join(REPO_ROOT, "docs", "epics", "reports", `${epic}-report.md`))).toBe(false);
  });
});

describe("every claim points at code a reader can check", () => {
  it.each(ALL_CLAIMS.map((entry) => [entry.id, entry] as const))(
    "%s cites a path that exists",
    (_id, entry: Claim) => {
      expect(existsSync(join(REPO_ROOT, entry.evidence)), `${entry.id}: ${entry.evidence}`).toBe(true);
    }
  );

  it("would fail on a path that does not exist", () => {
    expect(existsSync(join(REPO_ROOT, "packages/core/src/telepathy"))).toBe(false);
  });
});

describe("no claim asserts something that is not built", () => {
  const everything = ALL_CLAIMS.map((entry) => entry.text).join("\n");

  it.each(NOT_TRUE_YET)("claims nothing about %s", (_label, pattern) => {
    expect(everything).not.toMatch(pattern);
  });

  /**
   * The control, and it is the whole reason this list is worth having: these are the mockup's own
   * sentences. If a pattern is ever narrowed until it matches nothing, one of these stops matching
   * and this fails first.
   */
  it.each(NOT_TRUE_YET_CONTROLS)("would still catch %s", (mockupSentence, pattern) => {
    expect(mockupSentence).toMatch(pattern);
  });

  it.each([
    "A blok stores your text verbatim.",
    "Three providers behind one interface.",
    "41p run prints the exact bytes your program would send."
  ])("does not mistake %s for an unbacked claim", (honest) => {
    for (const [, pattern] of NOT_TRUE_YET) expect(honest).not.toMatch(pattern);
  });
});

describe("the registry is well formed", () => {
  it("has no duplicate ids", () => {
    expect(new Set(ALL_CLAIMS.map((entry) => entry.id)).size).toBe(ALL_CLAIMS.length);
  });

  it("keys CLAIMS by the id each entry carries", () => {
    for (const [key, entry] of Object.entries(CLAIMS)) expect(entry.id).toBe(key);
  });

  it("ends every claim as a sentence", () => {
    for (const entry of ALL_CLAIMS) {
      expect(entry.text.trim().endsWith("."), `${entry.id} does not end in a full stop`).toBe(true);
    }
  });

  it("throws on an id nobody defined, rather than rendering nothing", () => {
    expect(() => claim("no-such-claim")).toThrow(/unknown claim id/);
  });

  it("returns the text for an id that exists", () => {
    expect(claim("cli-run-prints")).toContain("calls no model");
  });
});
