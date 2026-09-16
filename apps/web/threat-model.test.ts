import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The paper half of EPIC-043 exists and says the things it was asked to say.
 *
 * ## Why a test over prose at all
 *
 * A threat model and a breach procedure are the two deliverables in this epic that no other test can
 * touch, and they are exactly the kind of thing that decays into a heading with nothing under it.
 * This does not check that the writing is good — nothing can — but it does check that the five threat
 * classes `docs/roadmap.md` names are each addressed, that every finding carries a severity, and that
 * the breach section still names the obligations it was written for. A later edit that quietly drops
 * one fails here rather than being discovered during an incident.
 *
 * It lives next to `sentry-hooks.test.ts` for the same reason that one does: `apps/web`'s root is
 * where this repository keeps guards that read across the tree, and `apps/` does not exist in the
 * public mirror, so nothing here can break `pnpm mirror-dry-run` the way a test in `packages/core`
 * that read `apps/` once did (`docs/PROCESS.md`, "Local green is not CI green", failure 1).
 */
const REPO = join(import.meta.dirname, "..", "..");

const THREAT_MODEL = readFileSync(join(REPO, "docs/security/byo-key-threat-model.md"), "utf8");
const RUNBOOK = readFileSync(join(REPO, "infra/RUNBOOK.md"), "utf8");

describe("the threat model", () => {
  it("is a document and not a stub", () => {
    expect(THREAT_MODEL.length).toBeGreaterThan(4000);
  });

  /** `docs/roadmap.md` EPIC-043: "master-key custody, rotation, exfiltration, insider, backup exposure". */
  it.each([
    ["master-key custody", /master-key custody/i],
    ["rotation", /finding 2 — rotation/i],
    ["exfiltration", /exfiltration/i],
    ["insider", /finding 4 — insider/i],
    ["backup exposure", /backup exposure/i],
  ])("addresses %s as a named finding", (_name, pattern) => {
    expect(THREAT_MODEL).toMatch(pattern);
  });

  it("gives every finding a severity", () => {
    const findings = THREAT_MODEL.match(/^### Finding \d+ — .*$/gm) ?? [];
    expect(findings.length).toBeGreaterThanOrEqual(5);
    for (const heading of findings) {
      expect(heading, `${heading} has no severity`).toMatch(/\b(high|medium|low)\b/);
    }
  });

  /**
   * The roadmap's Review line: "Soroush reads it. **Every high finding has an epic.**" `docs/backlog.md`
   * is not an unattended run's to edit, so the rows are written ready to paste — and this asserts
   * there is one for every finding marked high, by counting rather than by trusting the prose.
   */
  it("has a pasteable backlog row for every high finding", () => {
    const high = (THREAT_MODEL.match(/^### Finding \d+ — .*\bhigh\b.*$/gm) ?? []).length;
    expect(high).toBeGreaterThan(0);

    const section = THREAT_MODEL.split("## 8. Every high finding has an epic")[1] ?? "";
    const rows = section.match(/^\| EPIC-043[a-z] \|/gm) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(high);
    // Each row says which finding it closes, so the mapping is not left to be inferred.
    expect(section).toMatch(/master-key custody/);
    expect(section).toMatch(/scope and cap/);
  });

  it("says what a green build does not prove, rather than implying it proves everything", () => {
    expect(THREAT_MODEL).toContain("No penetration test has been done");
    expect(THREAT_MODEL).toContain("Nothing has ever been stored");
  });

  it("records why this is not libsodium, so the choice can be reversed on its merits", () => {
    expect(THREAT_MODEL).toMatch(/why this is not libsodium/i);
    expect(THREAT_MODEL).toMatch(/what would reverse it/i);
  });
});

describe("the breach section of the runbook", () => {
  const raw = RUNBOOK.split("## A provider key may have been exposed")[1] ?? "";
  /**
   * Whitespace-collapsed, because the file is hard-wrapped at 100 characters and a phrase that
   * matters — "Commission d'accès à l'information", "register of confidentiality incidents" — falls
   * across a line break. Asserting on the raw text would make these tests fail whenever somebody
   * rewraps a paragraph, which trains people to delete them.
   */
  const section = raw.replace(/\s+/g, " ");

  it("exists", () => {
    expect(section.length).toBeGreaterThan(1500);
  });

  it("puts revocation at the provider first, because it is the only step that stops the money", () => {
    expect(section).toMatch(/\*\*1\. Revoke at the provider/);
    expect(section.indexOf("Revoke at the provider")).toBeLessThan(section.indexOf("**2. Contain"));
  });

  it.each([
    ["Law 25's notification duty", /Commission d'accès à l'information/],
    ["Law 25's register of confidentiality incidents", /register of confidentiality incidents/i],
    ["how long that register is kept", /5 years/],
    ["PIPEDA's report to the OPC", /Office of the Privacy Commissioner of Canada/],
    ["PIPEDA's record-keeping period", /24 months/],
    ["telling the key's owner first", /immediately and directly/i],
  ])("names %s", (_name, pattern) => {
    expect(section).toMatch(pattern);
  });

  it("says the redaction is a safety net and not a permission", () => {
    expect(section).toContain("safety net, not a permission");
  });
});

describe("the master-key procedure", () => {
  const section = (RUNBOOK.split("## Generating or rotating the provider-key master key")[1] ?? "").replace(/\s+/g, " ");

  it("gives a command rather than a description, so the key is not produced by hand", () => {
    expect(section).toContain("generateMasterKey()");
  });

  it("explains the rotation that keeps everything readable throughout", () => {
    expect(section).toMatch(/comma-separated list/i);
    expect(section).toMatch(/The first entry seals; any entry opens/);
  });

  it("warns that destroying the old key early makes 30 days of backups unrestorable", () => {
    expect(section).toMatch(/Wait 30 days before destroying the old key/);
  });
});
