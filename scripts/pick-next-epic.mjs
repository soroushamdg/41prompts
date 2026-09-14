// Picks the epic an unattended run should do next, by reading docs/backlog.md.
//
// The rule, from the top: walk the stage tables in document order. The first row that is
// either a pickable `todo`, an uncleared gate, or a `todo` nobody has written an epic file for
// decides the answer. A gate reached before a todo is a full stop — GATE 3 and GATE 5 are
// Soroush's decisions and the epics behind them are not reachable by skipping past. So is an
// unwritten row, for the reason in `decide()`.
//
// Everything here is a read. Nothing in this file writes to the backlog, and nothing may:
// CLAUDE.md's "Never touch" list covers docs/backlog.md, and the one carve-out AUTONOMOUS.md
// grants is the status cell of the epic actually being worked, ticked by the run itself.
//
// Output is JSON (--json) so the shell wrapper never parses prose.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO = process.argv.includes("--repo")
  ? process.argv[process.argv.indexOf("--repo") + 1]
  : process.cwd();

const BACKLOG = join(REPO, "docs", "backlog.md");
const ROADMAP = join(REPO, "docs", "roadmap.md");
const EPICS_DIR = join(REPO, "docs", "epics");

// Statuses that mean "not ours to do", each for a different reason, none of which is "done
// enough to tick". A skipped row is never ticked and never counted as complete.
const TERMINAL = new Set(["done", "cut", "cancelled", "canceled", "deferred", "blocked"]);

// The advisor's own marker for a row that is scoped but deliberately not queued. It is
// already used in Stage 0 on three rows (EPIC-006b, 006c, 006d), so honouring it is reading
// the backlog's existing convention rather than inventing one.
const NOT_SCHEDULED = /not scheduled/i;

// PROCESS.md's `built — awaiting <the human step>` status. The work is finished and one box
// is honestly unticked because a person has to do something. Not ours.
const AWAITING = /\bawaiting\b/i;

// A gate row's status cell is `—` until Soroush records the decision. These are the words
// that mean he has.
const GATE_CLEARED = /^(done|passed|pass|go|cleared)\b/i;

// Phrases in an epic file that mean the epic itself waits on a person. Deliberately tight:
// every epic file mentions Soroush somewhere, so the marker has to be the specific claim
// "this cannot proceed without him", not the name.
const HUMAN_DEPENDENCY = [
  /\bwait(s|ing)? on Soroush\b/i,
  /\bawait(s|ing)? Soroush\b/i,
  /\bblocked on Soroush\b/i,
  /\bneeds Soroush\b/i,
  /\bSoroush must\b/i,
  /\bonly Soroush can\b/i,
  /\brequires? a human\b/i,
  /\bhuman step\b/i,
  /\brequires? a person\b/i,
  /\bcannot be done unattended\b/i
];

const stripCell = (s) =>
  s
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();

// The status cell is prose after its first word: `todo — scoped, not scheduled`,
// `done — staging half reverted by EPIC-009`. The leading word is the status; the rest is
// why. Both matter, so both are kept.
function parseStatus(cell) {
  const raw = stripCell(cell);
  const head = raw.split(/\s*[—–-]\s|\s*·\s/)[0].trim().toLowerCase();
  return { raw, head };
}

function parseBacklog(text) {
  const lines = text.split("\n");
  const rows = [];
  let stage = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      const title = heading[1].trim();
      stage = /^Stage\s/i.test(title) ? title : null;
      continue;
    }
    if (!stage) continue;
    if (!line.startsWith("|")) continue;

    const cells = line.split("|").slice(1, -1);
    if (cells.length < 5) continue;
    const id = stripCell(cells[0]);
    if (!id || /^-+$/.test(id) || id === "ID") continue;

    rows.push({
      stage,
      id,
      title: stripCell(cells[1]),
      size: stripCell(cells[2]),
      depends: stripCell(cells[3]),
      status: parseStatus(cells[4]),
      isGate: id.includes("▣") || /\bGATE\b/.test(id)
    });
  }
  return rows;
}

// A gate's criteria live in roadmap.md under `### ▣ GATE n · ...`. Quoted verbatim into the
// log so that the reason the loop stopped is legible without opening another file.
function gateCriteria(gateId) {
  if (!existsSync(ROADMAP)) return null;
  const n = gateId.match(/GATE\s*(\d+[a-z]?)/i)?.[1];
  if (!n) return null;
  const text = readFileSync(ROADMAP, "utf8").split("\n");
  const start = text.findIndex((l) => /^###\s/.test(l) && new RegExp(`GATE\\s*${n}\\b`).test(l));
  if (start === -1) return null;
  const out = [];
  for (let i = start; i < text.length; i++) {
    if (i > start && /^#{1,3}\s/.test(text[i])) break;
    out.push(text[i]);
  }
  return out.join("\n").trim();
}

// A row with an open BLOCKER file is not pickable, whatever its status cell says.
//
// PROCESS.md's answer to a blocker is that the advisor sets the row to `blocked` — but the
// advisor is asleep, the row is still `todo`, and without this the loop picks the same epic
// straight back, blocks on the same cause, and calls that "two consecutive blockers" while
// having tried exactly one epic. The file the run wrote is the marker until a person turns it
// into a status.
function openBlocker(id) {
  const rel = join("docs", "epics", `BLOCKER-${id}.md`);
  return existsSync(join(REPO, rel)) ? rel : null;
}

function epicFilesFor(id) {
  if (!existsSync(EPICS_DIR)) return [];
  const prefix = `${id}-`;
  return readdirSync(EPICS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .map((f) => join("docs", "epics", f));
}

// Requirement 3: an epic whose dependency is a person is skipped, named, and never ticked.
function humanDependency(id) {
  for (const rel of epicFilesFor(id)) {
    const text = readFileSync(join(REPO, rel), "utf8");
    for (const line of text.split("\n")) {
      for (const pattern of HUMAN_DEPENDENCY) {
        if (pattern.test(line)) {
          return { file: rel, line: line.trim().slice(0, 200) };
        }
      }
    }
  }
  return null;
}

function decide(rows, skipIds) {
  const skipped = [];

  for (const row of rows) {
    if (row.isGate) {
      if (GATE_CLEARED.test(row.status.raw)) {
        skipped.push({ id: row.id, status: row.status.raw, reason: "gate cleared" });
        continue;
      }
      return {
        outcome: "gate",
        stage: row.stage,
        gate: { id: row.id, title: row.title, status: row.status.raw, criteria: gateCriteria(row.id) },
        skipped
      };
    }

    if (TERMINAL.has(row.status.head)) {
      skipped.push({ id: row.id, status: row.status.raw, reason: `status ${row.status.head}` });
      continue;
    }
    // These two come before the plain "is it todo" test so the log gets the specific reason.
    // `built — awaiting the staging hand-drive` is skipped because it is waiting on a person,
    // which is worth saying; "its status is not todo" is true and tells nobody anything.
    if (AWAITING.test(row.status.raw)) {
      skipped.push({ id: row.id, status: row.status.raw, reason: "awaiting a human step" });
      continue;
    }
    if (NOT_SCHEDULED.test(row.status.raw)) {
      skipped.push({ id: row.id, status: row.status.raw, reason: "marked not scheduled" });
      continue;
    }
    if (row.status.head !== "todo") {
      // `current` lands here: an epic somebody already has in flight. Not a candidate, and
      // PROCESS.md's "never two epics in parallel" is why it is not quietly adopted either.
      skipped.push({ id: row.id, status: row.status.raw, reason: `status is not todo (${row.status.head})` });
      continue;
    }
    if (skipIds.has(row.id)) {
      skipped.push({ id: row.id, status: row.status.raw, reason: "in AUTONOMOUS_SKIP" });
      continue;
    }
    const blocker = openBlocker(row.id);
    if (blocker) {
      skipped.push({ id: row.id, status: row.status.raw, reason: `an open blocker — ${blocker}` });
      continue;
    }
    // An epic nobody has written is not an epic a machine should begin.
    //
    // EPIC-006 is why. Its row said `todo` and no `docs/epics/EPIC-006-*.md` existed, so nothing
    // told this picker that every one of its tasks needs Soroush's accounts and a payment method:
    // it was picked, first row of the first stage, ahead of every epic that was actually ready.
    //
    // A stop rather than a skip, which is the part worth being deliberate about. A `todo` row with
    // no file is not known to be human-blocked — it is *unknown*, and stepping over it would start
    // a later epic on the assumption that an unwritten row was safe to leave behind. The file is
    // where an epic says it needs a person, which is exactly what this cannot read when there is
    // no file. Someone writes the epic, or marks the row, and the loop moves again.
    const files = epicFilesFor(row.id);
    if (files.length === 0) {
      return {
        outcome: "unwritten",
        stage: row.stage,
        row: {
          id: row.id,
          title: row.title,
          size: row.size,
          depends: row.depends,
          status: row.status.raw,
          expected: join("docs", "epics", `${row.id}-<name>.md`)
        },
        skipped
      };
    }

    const human = humanDependency(row.id);
    if (human) {
      skipped.push({
        id: row.id,
        status: row.status.raw,
        reason: `epic file says it waits on a person — ${human.file}: "${human.line}"`
      });
      continue;
    }

    return {
      outcome: "pick",
      stage: row.stage,
      epic: {
        id: row.id,
        title: row.title,
        size: row.size,
        depends: row.depends,
        status: row.status.raw,
        files,
        slug: slugFor(row, files[0])
      },
      skipped
    };
  }

  return { outcome: "none", skipped };
}

// The branch name PROCESS.md asks for: `epic/xxx-name`, derived from the epic file so that a
// resumed run lands on the branch the first run made. Every pick has a file — a row without one
// stops the loop above — so there is no title-derived fallback to keep in step with this.
function slugFor(row, file) {
  const num = row.id.replace(/^EPIC-/, "").toLowerCase();
  const base = file.split("/").pop().replace(/\.md$/, "");
  const named = base.replace(new RegExp(`^${row.id}-`), "");
  return named ? `${num}-${named}` : num;
}

const skipIds = new Set(
  (process.env.AUTONOMOUS_SKIP ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
);

const rows = parseBacklog(readFileSync(BACKLOG, "utf8"));

// `--status EPIC-xxx` answers one question — what does the backlog say about this row — so
// the shell never has to re-implement the table parser in awk and get a different answer.
if (process.argv.includes("--status")) {
  const wanted = process.argv[process.argv.indexOf("--status") + 1];
  const row = rows.find((r) => r.id === wanted);
  process.stdout.write((row ? row.status.head : "") + "\n");
  process.exit(row ? 0 : 1);
}

const result = decide(rows, skipIds);

if (process.argv.includes("--tsv")) {
  // The pick as one tab-separated line: outcome, id, title, stage, branch.
  const fields =
    result.outcome === "pick"
      ? [result.outcome, result.epic.id, result.epic.title, result.stage, `epic/${result.epic.slug}`]
      : result.outcome === "gate"
        ? [result.outcome, result.gate.id, result.gate.title, result.stage, ""]
        : result.outcome === "unwritten"
          ? [result.outcome, result.row.id, result.row.title, result.stage, ""]
          : [result.outcome, "", "", "", ""];
  process.stdout.write(fields.join("\t") + "\n");
} else if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else if (result.outcome === "pick") {
  process.stdout.write(`${result.epic.id} — ${result.epic.title}\n`);
  process.stdout.write(`stage:  ${result.stage}\n`);
  process.stdout.write(`branch: epic/${result.epic.slug}\n`);
  process.stdout.write(`file:   ${result.epic.files[0]}\n`);
} else if (result.outcome === "gate") {
  process.stdout.write(`GATE: ${result.gate.id} — ${result.gate.title}\n`);
} else if (result.outcome === "unwritten") {
  process.stdout.write(`UNWRITTEN: ${result.row.id} — ${result.row.title}\n`);
  process.stdout.write(`stage:   ${result.stage}\n`);
  process.stdout.write(`status:  ${result.row.status}\n`);
  process.stdout.write(`missing: ${result.row.expected}\n`);
} else {
  process.stdout.write("No todo rows.\n");
}
