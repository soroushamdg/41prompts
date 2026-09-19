// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **The monthly audit, and the two ways a monthly check covers nothing.**
 *
 * `docs/roadmap.md` has carried EPIC-901 — `pnpm audit`, `pip-audit`, gitleaks, the SBOM and licence
 * gate output, a key rotation check — since the roadmap was written. It had never run. EPIC-007
 * deferred dependency scanning to this row by name and closed with an open question about seventeen
 * licence findings that were "worth an actual look rather than permanent background noise".
 *
 * The first run returns 3 npm advisories, 13 gitleaks hits and 8 licence findings, and **every one
 * of the 13 is a test fixture**. That is the shape of the problem this file guards:
 *
 * 1. **Nobody runs it** — five commands, four of which need an argument nobody remembers.
 *    `pnpm audit-run` is one command.
 * 2. **It says the same thing every month** — and after the second month nobody reads the output, so
 *    the real finding arrives into a list people have learned to skim. The baseline is what makes a
 *    green mean "nothing changed" instead of "the usual".
 *
 * So the properties worth testing are not "does it find things". They are: a finding that is not
 * accepted **fails**; an acceptance that matches nothing **also fails**; an acceptance past its
 * review date stops working; and every acceptance has a reason somebody can disagree with. The
 * PARTIAL verdict for a missing tool is `scripts/gates.mjs`'s word, reused deliberately.
 *
 * The check-running halves are not exercised here — they shell out to `pnpm audit`, `gitleaks` and
 * `pip-audit`, which take minutes and need three tools installed. `scripts/audit.mjs` is a thin
 * wrapper over those on purpose: anything it computed itself would be a second implementation that
 * can disagree with the tool (`_canonical.py`'s lesson from EPIC-054, paid for once already).
 *
 * **The module runs in a child process** because `turbo boundaries` refuses an import that leaves
 * `@41prompts/web`, and it is right to — CLAUDE.md rule 11 makes that guard load-bearing.
 * `apps/web/binary-files.test.ts` runs its script as a subprocess for the same reason.
 */

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SECURITY = join(REPO, "docs/security");
const MODULE = pathToFileURL(join(REPO, "scripts/audit.mjs")).href;

const CHECK_IDS = ["npm-advisories", "python-advisories", "secrets", "licences", "key-inventory"];

const ENTRY = {
  check: "secrets",
  id: "rule:file:hash",
  what: "a fixture",
  why: "read in full",
  acceptedBy: "somebody",
  acceptedOn: "2026-09-18",
  reviewOn: "2027-09-18",
};

// Each scenario is [checkId, findingIds, baselineEntries, today].
const SCENARIOS = {
  notAccepted: ["secrets", ["rule:file:hash"], [], "2026-09-18"],
  accepted: ["secrets", ["rule:file:hash"], [ENTRY], "2026-09-18"],
  stale: ["secrets", [], [ENTRY], "2026-09-18"],
  staleBelongsToAnotherCheck: ["secrets", [], [{ ...ENTRY, check: "npm-advisories" }], "2026-09-18"],
  pastReview: ["secrets", ["rule:file:hash"], [{ ...ENTRY, reviewOn: "2026-09-17" }], "2026-09-18"],
  onReviewDay: ["secrets", ["rule:file:hash"], [{ ...ENTRY, reviewOn: "2026-09-18" }], "2026-09-18"],
};

const SCAN_FIXTURES = {
  processEnvDot: { "a.ts": "process.env.RESEND_API_KEY" },
  processEnvBracket: { "a.ts": 'process.env["SENTRY_AUTH_TOKEN"]' },
  osEnviron: { "a.py": 'os.environ["DATABASE_URL"]' },
  envExample: { ".env.example": "TURNSTILE_SECRET_KEY=\n" },
  workflowSecret: { ".github/workflows/ci.yml": "${{ secrets.COOLIFY_DEPLOY_TOKEN }}" },
  // `infra/restore.sh` sets this one and never interpolates it, so an interpolation-only scan
  // misses a credential the script genuinely puts in its environment.
  shellAssignment: { "infra/restore.sh": 'export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"\n' },
  notCredentialShaped: { "a.ts": "process.env.POSTGRES_USER" },
  notAConfigFile: { "a.md": "process.env.RESEND_API_KEY" },
  suppressed: { "a.mjs": "process.env.DRIVE_WEB_HAS_SECRET" },
};

const INVENTORY_FIXTURE = [
  "| Name | What it opens |",
  "|---|---|",
  "| `BETTER_AUTH_SECRET` | sessions |",
  "| `R2_SECRET_ACCESS_KEY` | backups |",
  "",
  "`COOLIFY_API_TOKEN` is mentioned in prose and is deliberately not a row.",
].join("\n");

type Comparison = { isNew: string[]; silenced: string[]; expired: string[]; stale: string[] };
type Probe = {
  compare: Record<keyof typeof SCENARIOS, Comparison>;
  scan: Record<keyof typeof SCAN_FIXTURES, string[]>;
  notCredentials: Record<string, string>;
  inventoryFixture: string[];
  real: { used: string[]; listed: string[] };
};

const SOURCE = `
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import * as m from ${JSON.stringify(MODULE)};

const REPO = ${JSON.stringify(REPO)};
const SCENARIOS = ${JSON.stringify(SCENARIOS)};
const SCAN_FIXTURES = ${JSON.stringify(SCAN_FIXTURES)};

const finding = (id) => ({ id, severity: "review", title: id, where: "" });
const compare = ([check, ids, accepted, today]) => {
  const r = m.compare(check, ids.map(finding), m.readBaseline(JSON.stringify({ accepted })), today);
  return {
    isNew: r.isNew.map((f) => f.id),
    silenced: r.silenced.map((f) => f.id),
    expired: r.expired.map((f) => f.id),
    stale: r.stale.map((e) => e.id),
  };
};
const scan = (files) => [...m.credentialEnvNames((f) => files[f], Object.keys(files)).keys()].sort();

const tracked = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf-8" }).split("\\n").filter(Boolean);
const used = m.credentialEnvNames((f) => readFileSync(join(REPO, f), "utf-8"), tracked);
const listed = m.inventoryNames(readFileSync(join(REPO, "docs/security/key-inventory.md"), "utf-8"));

process.stdout.write(
  JSON.stringify({
    compare: Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, compare(v)])),
    scan: Object.fromEntries(Object.entries(SCAN_FIXTURES).map(([k, v]) => [k, scan(v)])),
    notCredentials: m.NOT_CREDENTIALS,
    inventoryFixture: [...m.inventoryNames(${JSON.stringify(INVENTORY_FIXTURE)})],
    real: { used: [...used.keys()].sort(), listed: [...listed].sort() },
  }),
);
`;

const probe: Probe = JSON.parse(
  execFileSync(process.execPath, ["--input-type=module", "-e", SOURCE], {
    cwd: REPO,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  }),
);

describe("compare — what makes a finding silent", () => {
  it("a finding with no baseline entry is new, and new is what fails the run", () => {
    expect(probe.compare.notAccepted.isNew).toEqual(["rule:file:hash"]);
    expect(probe.compare.notAccepted.silenced).toEqual([]);
  });

  it("the same finding is silent once it is accepted — the control for the case above", () => {
    expect(probe.compare.accepted.isNew).toEqual([]);
    expect(probe.compare.accepted.silenced).toEqual(["rule:file:hash"]);
  });

  it("an entry that matches nothing is stale, and stale fails too", () => {
    // The direction EPIC-072 shipped one-way and then fixed. An exemption for something that has
    // gone away is not harmless: it is the record of a decision about a thing nobody can see any
    // more, and it will silence that id if it ever comes back for a different reason.
    expect(probe.compare.stale.stale).toEqual(["rule:file:hash"]);
  });

  it("only counts an entry stale against its own check", () => {
    // Every check compares against the whole file, so without this an npm entry would read as stale
    // during the secrets check and the run could never go green.
    expect(probe.compare.staleBelongsToAnotherCheck.stale).toEqual([]);
  });

  it("stops silencing once the review date has passed", () => {
    expect(probe.compare.pastReview.expired).toEqual(["rule:file:hash"]);
    expect(probe.compare.pastReview.silenced).toEqual([]);
  });

  it("silences right up to the review date and not past it", () => {
    expect(probe.compare.onReviewDay.silenced).toEqual(["rule:file:hash"]);
    expect(probe.compare.onReviewDay.expired).toEqual([]);
  });
});

describe("the real baseline", () => {
  const baseline = JSON.parse(readFileSync(join(SECURITY, "audit-baseline.json"), "utf-8")) as {
    accepted: Record<string, string>[];
  };

  it("gives every acceptance a reason, an owner and a date it comes back", () => {
    expect(baseline.accepted.length).toBeGreaterThan(0);
    for (const e of baseline.accepted) {
      expect(CHECK_IDS, `${e.id} names a check that does not exist`).toContain(e.check);
      expect(e.what, `${e.id} has no 'what'`).toBeTruthy();
      // Long enough to be a sentence somebody can disagree with. "false positive" is not one.
      expect(String(e.why).length, `${e.id}'s reason is too short to argue with`).toBeGreaterThan(60);
      expect(e.acceptedBy, `${e.id} has no owner`).toBeTruthy();
      expect(e.acceptedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.reviewOn, `${e.id} has no review date, so nobody ever looks again`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(e.reviewOn) > String(e.acceptedOn), `${e.id} expires before it was accepted`).toBe(true);
    }
  });

  it("has no duplicate ids, which would make one entry unreachable", () => {
    const ids = baseline.accepted.map((e) => e.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("explains every acceptance in a month's write-up as well as in the file", () => {
    // The baseline holds the verdict; `docs/security/audit-<yyyy-mm>.md` holds the reasoning. An
    // entry in neither is an acceptance nobody argued for, and an entry in the JSON only is one
    // nobody will find when they are reading about the month it was made.
    const months = readdirSync(SECURITY).filter((f) => /^audit-\d{4}-\d{2}\.md$/.test(f));
    expect(months.length, "no month has been written up").toBeGreaterThan(0);
    const written = months.map((f) => readFileSync(join(SECURITY, f), "utf-8")).join("\n");
    for (const e of baseline.accepted) {
      expect(written, `${e.id} is accepted and no month's document mentions it`).toContain(e.id);
    }
  });
});

describe("credentialEnvNames — what counts as a credential", () => {
  it("finds a name read from process.env in source", () => {
    expect(probe.scan.processEnvDot).toEqual(["RESEND_API_KEY"]);
    expect(probe.scan.processEnvBracket).toEqual(["SENTRY_AUTH_TOKEN"]);
    expect(probe.scan.osEnviron).toEqual(["DATABASE_URL"]);
  });

  it("finds a name declared in .env.example, a workflow secret, and a shell assignment", () => {
    expect(probe.scan.envExample).toEqual(["TURNSTILE_SECRET_KEY"]);
    expect(probe.scan.workflowSecret).toEqual(["COOLIFY_DEPLOY_TOKEN"]);
    expect(probe.scan.shellAssignment).toEqual(["AWS_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"]);
  });

  it("ignores a name that is not credential-shaped, and a file type that is not configuration", () => {
    expect(probe.scan.notCredentialShaped).toEqual([]);
    expect(probe.scan.notAConfigFile).toEqual([]);
  });

  it("honours NOT_CREDENTIALS, which is exactly one name and says why", () => {
    // A suppression list that can grow quietly is the failure the whole audit is written against,
    // so this asserts the contents rather than the behaviour alone.
    expect(Object.keys(probe.notCredentials)).toEqual(["DRIVE_WEB_HAS_SECRET"]);
    for (const reason of Object.values(probe.notCredentials)) expect(String(reason).length).toBeGreaterThan(30);
    expect(probe.scan.suppressed).toEqual([]);
  });
});

describe("inventoryNames — reading docs/security/key-inventory.md", () => {
  it("takes the Name column of a table row and nothing else", () => {
    expect(probe.inventoryFixture).toEqual(["BETTER_AUTH_SECRET", "R2_SECRET_ACCESS_KEY"]);
  });
});

describe("the real key inventory and the real tree", () => {
  it("documents every credential the code uses", () => {
    const undocumented = probe.real.used.filter((n) => !probe.real.listed.includes(n));
    expect(undocumented, "these are read somewhere and are in no inventory row").toEqual([]);
  });

  it("uses every credential the inventory documents", () => {
    // The other direction. Without it the inventory rots into a list of things that used to exist,
    // which is worse than no inventory because it reads as current.
    const unused = probe.real.listed.filter((n) => !probe.real.used.includes(n));
    expect(unused, "these have rows and nothing uses them").toEqual([]);
  });

  it("found a real number of names, so agreement is not two empty sets", () => {
    expect(probe.real.used.length).toBeGreaterThan(15);
  });
});
