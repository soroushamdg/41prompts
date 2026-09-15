// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

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
const { Client } = require(require.resolve("pg", { paths: ["packages/db", "apps/worker"] }));

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

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. scripts/drive-epic-032.mjs's header has a local one.");
  process.exit(2);
}

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

/** **Read-only by construction**: every statement this script runs goes through here, and it
 *  refuses anything that is not a `select`. It reads a production-shaped database. */
async function rows(sql) {
  if (!/^\s*select\b/i.test(sql)) throw new Error("verify-first-call only runs SELECTs");
  const result = await client.query(sql);
  return result.rows;
}

const runs = await rows(`
  select id, model, cost_cents, latency_ms, purge_after, created_at, payload, prompt_hash, input_hash, owner
  from runs order by created_at desc limit ${LIMIT}
`);

if (runs.length === 0) {
  console.log("No runs at all. Trigger one through the Runs page first.");
  await client.end();
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
  await client.end();
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
await client.end();
process.exit(failures === 0 ? 0 : 1);
