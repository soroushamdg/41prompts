import { readdirSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, CHANGELOG_EPICS, NOT_USER_VISIBLE } from "./changelog";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const REPORTS = join(REPO_ROOT, "docs", "epics", "reports");

function shippedEpics(): string[] {
  return readdirSync(REPORTS)
    .filter((name) => name.endsWith("-report.md"))
    .map((name) => name.replace(/-report\.md$/, ""));
}

describe("the changelog only names epics that shipped", () => {
  it("names some", () => {
    // Or every assertion below passes over an empty list.
    expect(CHANGELOG_EPICS.length).toBeGreaterThan(20);
  });

  it.each(CHANGELOG_EPICS)("%s has a report", (epic) => {
    expect(existsSync(join(REPORTS, `${epic}-report.md`)), `${epic} has no report`).toBe(true);
  });

  it("would fail on an epic that never shipped", () => {
    expect(existsSync(join(REPORTS, "EPIC-070-report.md"))).toBe(false);
  });

  it("cites no epic twice", () => {
    expect(new Set(CHANGELOG_EPICS).size).toBe(CHANGELOG_EPICS.length);
  });
});

/**
 * The half that catches the omission rather than the invention.
 *
 * Checking that every row is real leaves the opposite failure wide open: an epic ships something a
 * reader would notice and nobody adds a row, so the newest thing on the page is six months old and
 * the page is wrong by silence. This walks `docs/epics/reports/` and insists every id is either
 * cited or explicitly declared invisible.
 */
describe("nothing that shipped is missing from it", () => {
  it.each(shippedEpics())("%s is either in the changelog or declared not user-visible", (epic) => {
    const accounted = CHANGELOG_EPICS.includes(epic) || epic in NOT_USER_VISIBLE;
    expect(
      accounted,
      `${epic} shipped and the changelog does not mention it. Add a row, or add it to NOT_USER_VISIBLE with the reason.`
    ).toBe(true);
  });

  it("would fail on an epic that is in neither", () => {
    const invented = "EPIC-123";
    expect(CHANGELOG_EPICS.includes(invented) || invented in NOT_USER_VISIBLE).toBe(false);
  });

  it("gives a reason for every invisible epic", () => {
    for (const [epic, reason] of Object.entries(NOT_USER_VISIBLE)) {
      expect(reason.length, `${epic} has no reason`).toBeGreaterThan(20);
    }
  });

  it("declares nothing invisible that it also lists", () => {
    for (const epic of Object.keys(NOT_USER_VISIBLE)) expect(CHANGELOG_EPICS).not.toContain(epic);
  });

  it("declares nothing invisible that has not shipped", () => {
    // The direction this file shipped one-way, found by EPIC-900 while fixing the red EPIC-901
    // left here. `CHANGELOG_EPICS` has always been checked against `docs/epics/reports/`;
    // `NOT_USER_VISIBLE` never was, so an id could sit here for an epic that does not exist —
    // and would then silence that id for a reason nobody wrote down if it ever did.
    //
    // It is the same hole as a stale entry in `docs/security/audit-baseline.json` or in
    // `scripts/dead-code.mjs`'s `ALLOWED`, and this repository has now closed it four times: an
    // exemption is only ever allowed to describe something that is really there.
    //
    // The consequence is deliberate. An epic cannot declare itself invisible before it has a
    // report, so the entry is written in the same commit as the report and not before it.
    const shipped = new Set(shippedEpics());
    for (const epic of Object.keys(NOT_USER_VISIBLE)) {
      expect(shipped.has(epic), `${epic} is declared not user-visible and has no report`).toBe(true);
    }
  });
});

describe("the entries are well formed", () => {
  it("has unique ids", () => {
    expect(new Set(CHANGELOG.map((entry) => entry.id)).size).toBe(CHANGELOG.length);
  });

  it("puts the newest stage first", () => {
    expect(CHANGELOG[0]?.id).toBe("stage-6");
    expect(CHANGELOG.at(-1)?.id).toBe("stage-0");
  });

  it("gives every row something to read", () => {
    for (const entry of CHANGELOG) {
      expect(entry.heading.length).toBeGreaterThan(5);
      expect(entry.body.length).toBeGreaterThan(40);
      expect(entry.epics.length).toBeGreaterThan(0);
    }
  });
});
