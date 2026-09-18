import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `docs/security/sdk-threat-model.md` keeps its shape (EPIC-057 C1, C2, C11).
 *
 * **Why a test over a document at all.** `docs/roadmap.md`'s Review line for EPIC-057 is *"Every
 * high finding has an owner and an epic"*, and that is a property somebody has to check on every
 * edit rather than once on the day it was written. A `high` finding whose row was dropped in a
 * later tidy-up is exactly the failure this repository has hit twice through other doors — a gate
 * pointed at the wrong tree (lesson 19) and a claim printed as decoration while nothing checked it
 * (lesson 23).
 *
 * **Every assertion here has a control**, because all of them are absence assertions and
 * `HANDOVER.md` lesson 8 is that an absence assertion which cannot fire reads as a green tick over
 * a claim nobody tested. The controls run the same matcher against a small document written to
 * fail, so a passing suite is about the real file and not about a regex that matches anything.
 *
 * **It lives in `apps/web`** rather than in a public package: `scripts/mirror-dry-run.sh` filters
 * the tree to the four public packages and `docs/` is not in it, so a test that read this path from
 * `packages/core` would be green locally and `ENOENT` in the one job that filters — *"Local green
 * is not CI green"* failure #1, and lesson 28. `forbidden-words.test.ts` is the precedent.
 */

const DOCUMENT = fileURLToPath(new URL("../../docs/security/sdk-threat-model.md", import.meta.url));
const text = readFileSync(DOCUMENT, "utf8");

/**
 * The six classes `docs/roadmap.md`'s Tasks line names, with the phrase each section must contain.
 *
 * The roadmap says "pointer tampering" and "DoS on pointer endpoint"; `CLAUDE.md`'s Vocabulary
 * forbids that word in identifiers and EPIC-051 settled it when it named the route, so the document
 * says **marker** and this list is the mapping. Written here rather than left implicit, because the
 * next person to read the roadmap against the document needs to see that nothing was dropped.
 */
const CLASSES: readonly { readonly roadmap: string; readonly heading: string }[] = [
  { roadmap: "key theft", heading: "key theft" },
  { roadmap: "pointer tampering", heading: "marker tampering" },
  { roadmap: "artifact substitution", heading: "build substitution" },
  { roadmap: "replay", heading: "replay" },
  { roadmap: "DoS on pointer endpoint", heading: "denial of service on the marker endpoint" },
  { roadmap: "dependency confusion", heading: "dependency confusion" },
];

/** A finding heading: `### Finding N — name · severity · state`. */
const FINDING = /^### Finding (\d+) — (.+?) · \*\*(high|medium|low)\*\*/gm;

interface Finding {
  readonly number: string;
  readonly name: string;
  readonly severity: string;
}

function findingsIn(source: string): Finding[] {
  const out: Finding[] = [];
  for (const match of source.matchAll(FINDING)) {
    out.push({ number: match[1] ?? "", name: match[2] ?? "", severity: match[3] ?? "" });
  }
  return out;
}

/**
 * The `| 057x | finding | severity | owner | why |` rows of §8's second table.
 *
 * Parsed by column rather than by a regex over the whole line, because the property under test is
 * *"every high finding has an **owner**"* — and an owner is a specific cell, not a word somewhere
 * on the row. A check that only asked whether the line existed would pass on a row whose owner cell
 * was empty, which is the row this is looking for.
 */
interface OwnerRow {
  readonly row: string;
  /** Which finding numbers this row answers, from the second cell. */
  readonly findings: readonly string[];
  readonly severity: string;
  readonly owner: string;
}

function ownerRowsIn(source: string): OwnerRow[] {
  const out: OwnerRow[] = [];
  for (const line of source.split("\n")) {
    if (!/^\|\s*057[a-z]\s*\|/.test(line)) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    // ["", "057a", "3 and 5, …", "**high**", "Soroush decides, …", "why …", ""]
    out.push({
      row: cells[1] ?? "",
      findings: [...(cells[2] ?? "").matchAll(/\d+/g)].map((one) => one[0]),
      severity: (cells[3] ?? "").replace(/\*/g, ""),
      owner: cells[4] ?? "",
    });
  }
  return out;
}

describe("the six threat classes the roadmap names", () => {
  for (const { roadmap, heading } of CLASSES) {
    it(`covers ${roadmap}`, () => {
      expect(text.toLowerCase(), `no section for "${heading}"`).toContain(heading.toLowerCase());
    });
  }

  it("has a section heading for each one, not merely the words somewhere in the prose", () => {
    const headings = findingsIn(text).map((finding) => finding.name.toLowerCase());
    for (const { heading } of CLASSES) {
      expect(headings.some((one) => one.includes(heading.toLowerCase())), `${heading} is not a finding heading`).toBe(
        true,
      );
    }
  });

  it("would fail on a document that dropped one — the control", () => {
    // Without this, `toContain` over a 450-line file is close to unfalsifiable.
    const missingOne = text.replace(/### Finding 6 — dependency confusion[\s\S]*?(?=\n---)/, "");
    expect(missingOne).not.toBe(text);
    const headings = findingsIn(missingOne).map((finding) => finding.name.toLowerCase());
    expect(headings.some((one) => one.includes("dependency confusion"))).toBe(false);
  });
});

describe("every finding is triaged", () => {
  const findings = findingsIn(text);

  it("finds them all, so the checks below are not vacuous", () => {
    // The control for this whole block: a walk that matched nothing would make every loop pass.
    expect(findings.length).toBeGreaterThanOrEqual(6);
    expect(findings.map((one) => one.number)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("gives each one a severity from the three the document defines", () => {
    for (const finding of findings) {
      expect(["high", "medium", "low"], `finding ${finding.number}`).toContain(finding.severity);
    }
  });

  it("would fail on a finding with no severity — the control", () => {
    const untriaged = "### Finding 7 — something nobody graded · unmitigated\n";
    expect(findingsIn(untriaged)).toEqual([]);
  });
});

describe("every high finding has an owner and an epic", () => {
  const findings = findingsIn(text);
  const high = findings.filter((finding) => finding.severity === "high");
  const rows = ownerRowsIn(text);

  it("has at least one high finding and at least one row, so neither list is empty", () => {
    // Two controls in one. An empty `high` list would make the loop below pass without checking
    // anything, and an empty row list would mean §8 is not being read at all.
    expect(high.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);
  });

  for (const finding of high) {
    it(`finding ${finding.number} (${finding.name}) is answered by a row`, () => {
      const answering = rows.filter((row) => row.findings.includes(finding.number));
      expect(answering.length, `no 057x row names finding ${finding.number}`).toBeGreaterThan(0);
    });
  }

  it("names an owner in every row", () => {
    expect(text, "§8's table has no owner column").toMatch(/\|\s*owner\s*\|/);
    for (const row of rows) {
      expect(row.owner, `${row.row} has no owner`).not.toBe("");
    }
  });

  it("would fail on a row whose owner cell is empty — the control", () => {
    const empty = ownerRowsIn("| 057z | 9 | **high** |  | because |");
    expect(empty.length).toBe(1);
    expect(empty[0]?.owner).toBe("");
  });

  it("names Soroush on every row an unattended run cannot close", () => {
    // `docs/AUTONOMOUS.md`: a row whose dependency is a person is skipped and said out loud. The
    // two `high` findings this epic could not close are both his, so the table has to say so.
    const his = rows.filter((row) => row.owner.includes("Soroush"));
    expect(his.length).toBeGreaterThanOrEqual(2);
  });

  it("would fail if a high finding had no row — the control", () => {
    const orphaned = `${text}\n### Finding 9 — an unanswered high · **high** · owed\n`;
    const orphan = findingsIn(orphaned).find((one) => one.number === "9");
    expect(orphan?.severity).toBe("high");
    expect(ownerRowsIn(orphaned).some((row) => row.findings.includes("9"))).toBe(false);
  });

  it("carries paste-ready backlog rows rather than editing the backlog", () => {
    // `docs/backlog.md` is Soroush's (`docs/AUTONOMOUS.md`, hard limits), so §8 writes the rows out.
    expect(text).toContain("| EPIC-057a |");
    expect(text).toContain("| EPIC-057b |");
    expect(text).toContain("| EPIC-057c |");
  });
});

describe("the document says what it does not prove (C11)", () => {
  const section = text.slice(text.indexOf("## 5. What a green build here does not prove"));

  it("has the section", () => {
    expect(section.startsWith("## 5.")).toBe(true);
  });

  for (const owed of [
    "penetration test",
    "external reviewer",
    "package name is registered",
    "Nothing is signed",
    "None of it is deployed",
  ]) {
    it(`names "${owed}"`, () => {
      expect(section, `§5 does not mention ${owed}`).toContain(owed);
    });
  }

  it("would fail if the section were replaced with a reassurance — the control", () => {
    const reassuring = "## 5. What a green build here does not prove\n\nNothing. It is all fine.\n";
    expect(reassuring).not.toContain("penetration test");
  });
});

describe("the vocabulary", () => {
  it("says marker rather than the forbidden word, except where it quotes the roadmap", () => {
    // ADR-003 and `CLAUDE.md`. The roadmap's own line is quoted in three places on purpose — the
    // mapping in `CLASSES` above is the record of it — so this asserts the *headings* are clean
    // rather than that the word never appears.
    for (const finding of findingsIn(text)) {
      expect(finding.name.toLowerCase(), `finding ${finding.number}`).not.toContain("pointer");
    }
  });

  it("would fail on a heading that used it — the control", () => {
    expect(findingsIn("### Finding 1 — pointer tampering · **high** · x\n")[0]?.name).toContain("pointer");
  });
});
