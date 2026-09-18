import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The copyright holder is named, everywhere it is a claim and nowhere it is a record.
 *
 * ## Why this test exists
 *
 * Until 2026-09-18 `CLAUDE.md` said the holder was `<legal entity>` "until incorporation", and 433
 * tracked files carried that placeholder — 423 of them on an `SPDX-FileCopyrightText` line, which
 * is to say in the one place a licence header states who owns the thing. EPIC-056 substituted
 * `41Prompts Inc.` once the company existed and the IP assignment was executed.
 *
 * A one-time substitution is not worth much on its own. What this guards is the two ways it comes
 * undone:
 *
 * 1. **A new file is written with the placeholder**, copied from an older header. `reuse lint` will
 *    not catch it — a header naming `<legal entity>` is a perfectly well-formed header.
 * 2. **A historical record is edited to make a check pass.** The nineteen prose matches below are
 *    committed reports, session logs, plans and a specialist review that describe the placeholder
 *    as a fact of their own date. They were accurate then and they are still accurate about then.
 *    Rewriting one would make the repository's own account of itself wrong, which is a worse
 *    outcome than the placeholder it removes — so this test fails if one of them stops saying it.
 *
 * ## The dividing line is mechanical, not editorial
 *
 * Metadata is a line beginning `SPDX-FileCopyrightText`, a `LICENSE` body, a `NOTICE` body,
 * `REUSE.toml`'s supplier, or `CLAUDE.md`'s naming rule — the rule the 423 headers implement.
 * Prose is a match inside a sentence. Nothing here has to judge intent.
 */

const REPO = join(import.meta.dirname, "..", "..");
const HOLDER = "41Prompts Inc.";
const PLACEHOLDER = `<legal ${"entity"}>`;

const tracked = () =>
  execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf-8" }).split("\n").filter(Boolean);

const read = (rel: string) => readFileSync(join(REPO, rel), "utf-8");

/**
 * Committed records that describe the placeholder as it stood on their own date. Each one is
 * listed by name so that this is visibly a decision rather than a leftover.
 */
const HISTORICAL_RECORDS = [
  "docs/decisions/ADR-002-licensing-and-repos.md",
  "docs/epics/EPIC-000-repo-scaffold.md",
  "docs/epics/EPIC-017-legal-minimum.md",
  "docs/epics/GATE-5-readiness.md",
  "docs/epics/plan-EPIC-000.md",
  "docs/epics/reports/EPIC-000-report.md",
  "docs/epics/reports/EPIC-016-report.md",
  "docs/epics/reports/EPIC-017-report.md",
  "docs/epics/sessions/EPIC-000-session.md",
  "docs/epics/sessions/EPIC-017-session.md",
  "docs/reviews/2026-09-specialist-review.md",
];

/** EPIC-056's own paperwork, which necessarily quotes the string it removed. */
const THIS_EPIC = [
  "docs/epics/CURRENT.md",
  "docs/epics/EPIC-056-open-source-split.md",
  "docs/epics/plan-EPIC-056.md",
  "docs/epics/reports/EPIC-056-report.md",
  "docs/epics/sessions/EPIC-056-session.md",
  "apps/web/legal-entity.test.ts",
];

/** Every file that publishes a licence claim about who owns this. */
const PROPRIETARY_LICENCES = [
  "LICENSES/LicenseRef-41Prompts-Proprietary.txt",
  "apps/worker/LICENSE",
  "packages/db/LICENSE",
  "packages/logger/LICENSE",
  "packages/ui/LICENSE",
];

const NOTICES = [
  "packages/cli-unscoped/NOTICE",
  "packages/cli/NOTICE",
  "packages/core/NOTICE",
  "packages/sdk-ts/NOTICE",
  "sdks/python-alias/NOTICE",
  "sdks/python/NOTICE",
];

/** The Apache-2.0 text ships verbatim; its appendix is instructions, not a claim. */
const APACHE_LICENCES = [
  "packages/cli-unscoped/LICENSE",
  "packages/cli/LICENSE",
  "packages/core/LICENSE",
  "packages/sdk-ts/LICENSE",
  "sdks/python-alias/LICENSE",
  "sdks/python/LICENSE",
];

describe("the copyright holder", () => {
  it("is named on every licence header, with no placeholder left anywhere", () => {
    const offenders: string[] = [];
    for (const rel of tracked()) {
      let text: string;
      try {
        text = read(rel);
      } catch {
        continue; // a path that is tracked but not a readable file here
      }
      text.split("\n").forEach((line, i) => {
        if (line.includes("SPDX-FileCopyrightText") && line.includes(PLACEHOLDER)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("appears in every proprietary licence and every NOTICE", () => {
    for (const rel of [...PROPRIETARY_LICENCES, ...NOTICES]) {
      expect(read(rel), rel).toContain(HOLDER);
      expect(read(rel), rel).not.toContain(PLACEHOLDER);
    }
  });

  it("is the supplier in REUSE.toml and the rule in CLAUDE.md", () => {
    expect(read("REUSE.toml")).toContain(`SPDX-PackageSupplier = "${HOLDER}"`);

    const rule = read("CLAUDE.md")
      .split("\n")
      .find((l) => l.includes("Copyright holder is"));
    expect(rule).toBeDefined();
    expect(rule).toContain(HOLDER);
    // The condition has been met; a rule that still states it invites the placeholder back.
    expect(rule).not.toContain("until incorporation");
  });

  it("is NOT written into the Apache-2.0 appendix, which is the licence's own text", () => {
    // Filling this in would be editing the licence. Apache-2.0 section 4(d) puts the holder in
    // NOTICE, which the test above checks, and the appendix stays as the ASF publishes it.
    for (const rel of APACHE_LICENCES) {
      expect(read(rel), rel).toContain("Copyright [yyyy] [name of copyright owner]");
      expect(read(rel), rel).not.toContain(HOLDER);
    }
  });
});

describe("the historical record", () => {
  it("still says what it said, and nothing else has acquired the placeholder", () => {
    const withPlaceholder = tracked().filter((rel) => {
      try {
        return read(rel).includes(PLACEHOLDER);
      } catch {
        return false;
      }
    });

    const allowed = new Set([...HISTORICAL_RECORDS, ...THIS_EPIC]);
    const unexpected = withPlaceholder.filter((rel) => !allowed.has(rel));
    expect(unexpected, "a new file carries the placeholder").toEqual([]);
  });

  it("keeps every record that described the placeholder as current", () => {
    // Deleting or rewriting one of these is the cheap way to make the test above pass, and it
    // would make the repository's account of its own licensing history wrong.
    const lost = HISTORICAL_RECORDS.filter(
      (rel) => !existsSync(join(REPO, rel)) || !read(rel).includes(PLACEHOLDER)
    );
    expect(lost, "a historical record stopped describing the placeholder").toEqual([]);
  });
});
