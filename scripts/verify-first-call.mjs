// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary

/**
 * EPIC-031a's checklist, read from the database rather than from a screen.
 *
 * ## Why this exists
 *
 * Six of the eight things the first real call has to establish are facts in a `runs` row — the
 * stored payload, `purge_after`, the latency, the cost, the hashes, the reconciled reservation.
 * Reading them off a page is how a criterion gets ticked on an impression. This asserts them and
 * prints the numbers, including the two nobody has ever seen: **what `claude-sonnet-5` actually
 * resolves to**, and **what one run really costs**.
 *
 * ## It tells a real call from a faked one
 *
 * That is the point. A fake writes `raw: { provider: "fake" }`; a real Anthropic response carries a
 * `model` and a `usage` of its own. A verifier that could not distinguish them would happily bless
 * three epics' worth of fake runs as the first real call.
 *
 * ## It never prints the key
 *
 * `CLAUDE.md` and EPIC-031a decision 4. It goes further and *looks* for one: `runs` has a unit test
 * asserting no stored payload contains a key-shaped string, and this is the first time that check
 * has had real provider data to run against.
 *
 * Usage:
 *   DATABASE_URL=postgres://… node scripts/verify-first-call.mjs
 *   node scripts/verify-first-call.mjs --limit 10
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

/**
 * `pg` rather than shelling out to `psql`.
 *
 * `psql` is not on this machine's PATH and is not a dependency of anything here, so a script that
 * needed it would work for whoever happened to have Postgres installed. `pg` is already in the
 * lockfile — it is what drizzle talks to — and resolving it through a workspace package is how a
 * root-level plain-Node script reaches a pnpm-hoisted dependency it does not itself declare.
 */
const require = createRequire(import.meta.url);

const LIMIT = Number(argOf("--limit") ?? 6);
const DATABASE_URL = process.env.DATABASE_URL;

/** 365 days, the constant `purgeAfterFor` uses. Duplicated as a number on purpose: this is an
 *  independent check, and importing the constant would make it agree with itself. */
const RETENTION_DAYS = 365;

/** Anthropic keys start `sk-ant-`. Any `sk-`-prefixed run of key-ish characters is refused. */
const KEY_SHAPED = /sk-[A-Za-z0-9_-]{16,}/;

let failures = 0;
let checks = 0;

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function check(ok, title, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${title}${detail ? " — " + detail : ""}`);
}

function note(title, value) {
  console.log(`  ....  ${title}: ${value}`);
}

/**
 * Two transports, because the row this checks can live in two places.
 *
 * **Local** (`DATABASE_URL`) talks to Postgres through `pg`.
 *
 * **`--staging`** goes over the box: `ssh 41p-box docker exec … psql`, with the SQL piped over
 * **stdin** rather than interpolated into a command. `docs/PROCESS.md` documents that shape and the
 * reason is not style: a statement passed through `psql -c` inside `sh -c '…'` inside `ssh '…'`
 * loses its quotes, and `like 'claude-drive-%'` arrives as `like claude-drive-%`. That exact bug
 * cost this epic a run.
 *
 * `--staging` uses `docker exec`, which `CLAUDE.md` server-access rule 3 puts behind one command,
 * one yes — the standing exceptions cover the magic-link read and the drive cleanup, and this is
 * neither. Every statement is still a `SELECT`, refused otherwise.
 */
const STAGING = process.argv.includes("--staging");

/** One command on the box. Output returned, never echoed. */
function onBox(command) {
  return execFileSync("ssh", ["-o", "ConnectTimeout=20", "41p-box", command], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

/**
 * Staging's postgres, by deriving the app uuid rather than hardcoding it.
 *
 * `docs/PROCESS.md`: "Look the container name up, never hardcode it." The random suffix changes on
 * every redeploy; the stable part is the Coolify application uuid, read off whichever worker
 * reports `DEPLOY_ENV=staging`.
 */
function stagingPostgres() {
  const workers = onBox('docker ps --format "{{.Names}}" | grep -i worker').split("\n").filter(Boolean);
  const staging = workers.find(
    (name) =>
      onBox(
        `docker inspect ${name} --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DEPLOY_ENV=' | head -1 | cut -d= -f2`
      ) === "staging"
  );
  if (!staging) throw new Error(`no worker reports DEPLOY_ENV=staging; saw ${workers.join(", ")}`);
  const appUuid = staging.split("-")[1];
  const pg = onBox('docker ps --format "{{.Names}}" | grep -i postgres')
    .split("\n")
    .filter(Boolean)
    .find((name) => name.includes(appUuid));
  if (!pg) throw new Error("no postgres container carries staging's app uuid");
  return pg;
}

const STAGING_PG = STAGING ? stagingPostgres() : null;

let client = null;
if (!STAGING) {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is required, or pass --staging. scripts/drive-epic-032.mjs's header has a local one.");
    process.exit(2);
  }
  const { Client } = require(require.resolve("pg", { paths: ["packages/db", "apps/worker"] }));
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
}

/** **Read-only by construction**: every statement this script runs goes through here, and it
 *  refuses anything that is not a `select`. It reads a production-shaped database. */
async function rows(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("verify-first-call only runs SELECTs");
  if (STAGING) {
    // One JSON document out, so no value has to survive a column delimiter.
    const wrapped = `select coalesce(json_agg(t), '[]')::text from (${sql.replace(/;\s*$/, "")}) t;`;
    const out = execFileSync(
      "ssh",
      [
        "-o",
        "ConnectTimeout=20",
        "41p-box",
        `docker exec -i ${STAGING_PG} sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA'`,
      ],
      { encoding: "utf8", input: wrapped, maxBuffer: 64 * 1024 * 1024 }
    ).trim();
    return JSON.parse(out || "[]");
  }
  const result = await client.query(sql);
  return result.rows;
}

const runs = await rows(`
  select id, model, cost_cents, latency_ms, purge_after, created_at, payload, prompt_hash, input_hash, owner
  from runs order by created_at desc limit ${LIMIT}
`);

if (runs.length === 0) {
  console.log("No runs at all. Trigger one through the Runs page first.");
  if (client) await client.end();
  process.exit(2);
}

console.log(`\nThe ${runs.length} most recent runs\n`);

/**
 * A run is **real** when its stored payload is a provider's own body rather than one of the two
 * fakes'. `anthropic.ts` stores `result.response.body`, which carries Anthropic's `model` and
 * `usage`; the fakes store `{ provider: "fake" }` or `{ provider: "fake-judge" }`.
 */
function isFake(payload) {
  const raw = payload?.raw ?? {};
  return typeof raw.provider === "string" && raw.provider.startsWith("fake");
}

const real = runs.filter((run) => !isFake(run.payload));
const fake = runs.length - real.length;

for (const run of runs) {
  const tag = isFake(run.payload) ? "fake" : "REAL";
  console.log(`  ${tag}  ${run.id}  ${run.model}  ${run.cost_cents ?? "—"}c  ${run.latency_ms}ms  ${run.created_at}`);
}
console.log("");

if (real.length === 0) {
  console.log(`All ${fake} of them were answered by a fake. **No real call has been made yet.**`);
  console.log("That is the state EPIC-031a exists to change; this script has nothing to verify.");
  if (client) await client.end();
  process.exit(1);
}

const run = real[0];
console.log(`Verifying the newest real call: ${run.id}\n`);

// ── rule 6: the raw payload, stamped ───────────────────────────────────────────────────────────
check(run.payload?.raw !== undefined, "the raw provider payload is stored (rule 6)");

const purgeAfter = new Date(run.purge_after);
const createdAt = new Date(run.created_at);
const days = Math.round((purgeAfter - createdAt) / 86_400_000);
check(days === RETENTION_DAYS, "purge_after is stamped 365 days out", `${days} days`);

// ── the key is nowhere ─────────────────────────────────────────────────────────────────────────
const serialised = JSON.stringify(run.payload);
check(!KEY_SHAPED.test(serialised), "no key-shaped string in the stored payload");

// ── is this the provider's own body, or our normalised view of it? ─────────────────────────────
//
// Rule 6 asks for the raw provider payload. On 2026-09-16 the SDK surfaced no body and the adapter
// fell back, so this reports which was stored rather than letting a `PASS` on "a payload exists"
// imply the stronger thing.
const normalised = run.payload?.raw?.normalised === true;
note(
  "rule 6",
  normalised
    ? "stored the SDK's NORMALISED view — the provider surfaced no raw body"
    : "stored the provider's own response body"
);

// ── the resolved model, which is the fact rule 7 is about ──────────────────────────────────────
const resolved = run.payload?.raw?.model;
check(typeof resolved === "string" && resolved.length > 0, "the provider named the model it used", String(resolved));
if (typeof resolved === "string") {
  note("asked for", run.model);
  note("Anthropic used", resolved);
  if (resolved !== run.model) {
    note("NOTE", `\`${run.model}\` is an alias and resolved to \`${resolved}\` — record this in the report`);
  }
}

// ── usage arrived, rather than the estimate being used ─────────────────────────────────────────
const usage = run.payload?.raw?.usage ?? {};
const inTok = usage.input_tokens ?? usage.inputTokens;
const outTok = usage.output_tokens ?? usage.outputTokens;
check(
  Number.isInteger(inTok) && Number.isInteger(outTok),
  "the provider reported token counts (not our four-chars-per-token estimate)",
  `in ${inTok}, out ${outTok}`
);

// ── latency is plausible ───────────────────────────────────────────────────────────────────────
check(run.latency_ms > 50 && run.latency_ms < 60_000, "latencyMs is plausible", `${run.latency_ms}ms`);

// ── the cost, and whether it matches the price table ───────────────────────────────────────────
const PRICES = {
  "claude-opus-5": { input: 1500, output: 7500 },
  "claude-sonnet-5": { input: 300, output: 1500 },
  "claude-haiku-4-5-20251001": { input: 100, output: 500 },
};
const price = PRICES[run.model];
if (price && Number.isInteger(inTok) && Number.isInteger(outTok)) {
  const expected = Math.ceil((inTok * price.input) / 1_000_000 + (outTok * price.output) / 1_000_000);
  check(
    Math.abs((run.cost_cents ?? 0) - expected) <= 1,
    "the stored cost matches the price table applied to the reported tokens",
    `stored ${run.cost_cents}c, re-derived ${expected}c`
  );
}
note("THE NUMBER", `this run cost ${run.cost_cents} cent(s) — $${((run.cost_cents ?? 0) / 100).toFixed(4)}`);

// ── the reservation reconciled against the real cost ───────────────────────────────────────────
const [budget] = await rows(`select cap_cents, spent_cents from run_budgets where owner = '${run.owner}'`);
if (budget) {
  const realTotal = real.reduce((sum, r) => sum + (r.cost_cents ?? 0), 0);
  check(
    budget.spent_cents >= realTotal && budget.spent_cents < budget.cap_cents,
    "the reservation reconciled — spend is the actual cost, not the reserved worst case",
    `spent ${budget.spent_cents}c of ${budget.cap_cents}c; real calls totalled ${realTotal}c`
  );
}

// ── the cache answers a repeat ─────────────────────────────────────────────────────────────────
const [dupes] = await rows(`
  select count(*)::int as n from (
    select prompt_hash, input_hash, model from runs group by 1,2,3 having count(*) > 1
  ) d
`);
check(
  (dupes?.n ?? 0) === 0,
  "no two runs share a prompt+input+model — the cache answered every repeat rather than re-calling",
  `${dupes?.n ?? 0} duplicated cache keys`
);

// ── the judge, which has never met a real model either ─────────────────────────────────────────
const judged = real.filter((r) => r.model === "claude-haiku-4-5-20251001");
if (judged.length > 0) {
  note("the judge ran for real", `${judged.length} call(s), ${judged.reduce((s, r) => s + (r.cost_cents ?? 0), 0)}c`);
} else {
  note("the judge", "no real judge call yet — add a `refuses_to_answer` blok and run again");
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} of ${checks} CHECKS FAILED`}`);
console.log(`${real.length} real call(s), ${fake} fake, in the ${runs.length} most recent runs.\n`);
if (client) await client.end();
process.exit(failures === 0 ? 0 : 1);
