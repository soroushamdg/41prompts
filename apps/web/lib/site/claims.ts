/**
 * Every sentence the marketing site asserts about the product, as data.
 *
 * `docs/roadmap.md`'s Review line for EPIC-072 is **"every claim maps to a shipped epic"**, and a
 * review line is a thing somebody has to redo on every copy edit. This is the mechanical version:
 * a page may only render a sentence that appears here, and every entry here names the epic that
 * shipped the behaviour and a path in this repository where the behaviour lives.
 *
 * ## Why this exists at all
 *
 * `docs/design/41prompts-full-mockup.html` was drawn before most of the product. Read as a
 * specification of *copy* it asserts SOC 2 Type I underway, nine lessons, a shared blok library,
 * SSO/SAML, roles and an audit trail, per-project retention control, six blog posts, three open
 * jobs, a second co-founder, and a changelog whose newest entry is `v0.9`. None of that is true.
 * `docs/design/README.md` already rules that the prototypes are the spec **for the interface** and
 * that anything they imply about what gets sent, stored or published is an illustration. EPIC-072
 * extends that by one step: **a prototype is not a source of facts about the company.**
 *
 * ## The rules `claims.test.ts` enforces, each with a positive control
 *
 * 1. `epic` names a file in `docs/epics/reports/`. An epic with no report did not ship.
 * 2. `evidence` is a path that exists.
 * 3. No claim text matches the denylist — the things the mockup says and the product does not do.
 * 4. Every id is rendered by some page, so a claim cannot rot here after its page drops it.
 *
 * ## What this is not
 *
 * It is not a content management system and it is not every string on a page. Headings, link text,
 * navigation and structural words are ordinary JSX. What belongs here is a **claim**: a sentence a
 * reader could hold us to.
 */

import { DECOMPILE_RETENTION_DAYS, RUN_COUNT_RETENTION_DAYS, RUN_PAYLOAD_RETENTION_DAYS } from "@41prompts/db";

export interface Claim {
  /** Stable and kebab-case. Pages reference this, so renaming one is a visible change. */
  readonly id: string;
  /** The sentence, exactly as it renders. */
  readonly text: string;
  /** The epic that shipped the behaviour. Must have a report in `docs/epics/reports/`. */
  readonly epic: string;
  /** Where in this repository the behaviour lives, for a reader who wants to check. */
  readonly evidence: string;
}

/**
 * Retention numbers come from the constants that enforce them, never retyped.
 *
 * EPIC-017 established this for the privacy page: a number a purge job enforces and a number a page
 * prints are the same number or the page is wrong, and the only way to keep them the same is to
 * have one of them.
 */
const RETENTION = {
  decompile: DECOMPILE_RETENTION_DAYS,
  runCounts: RUN_COUNT_RETENTION_DAYS,
  payloads: RUN_PAYLOAD_RETENTION_DAYS
} as const;

const ENTRIES: readonly Claim[] = [
  // ─────────────────────────── the editor ───────────────────────────
  {
    id: "blok-canvas",
    text: "A prompt is a set of typed bloks — context, constraint, example, expected — that you add, edit, reorder and delete on a canvas.",
    epic: "EPIC-021a",
    evidence: "apps/web/app/app/pr/[promptId]/page.tsx"
  },
  {
    id: "per-blok-compilation",
    text: "Compilation is per blok. Change one card and exactly one span of the compiled prompt changes, so a diff stays readable and a comparison stays valid.",
    epic: "EPIC-020",
    evidence: "packages/core/src/compile"
  },
  {
    id: "verbatim-spans",
    text: "A blok stores your text verbatim. Summaries are metadata, and nothing we compile is a paraphrase of what you wrote.",
    epic: "EPIC-020",
    evidence: "packages/core/src/compile/types.ts"
  },
  {
    id: "edited-by-hand",
    text: "Edit any span by hand and the compiler releases it, marks the drift, and offers to update it from its blok when you are ready.",
    epic: "EPIC-021b",
    evidence: "apps/web/lib/canvas"
  },
  {
    id: "variables-contract",
    text: "Every {{placeholder}} you write becomes a typed variable, and the set of them is a contract your code is checked against.",
    epic: "EPIC-022",
    evidence: "packages/core/src/variables"
  },

  // ─────────────────────────── the decompiler ───────────────────────────
  {
    id: "decompiler",
    text: "Paste a prompt you already run and it comes back as named bloks, each mapped to the exact range of your text it came from.",
    epic: "EPIC-013",
    evidence: "apps/web/app/decompile/page.tsx"
  },
  {
    id: "deterministic-segmentation",
    text: "Where one blok stops and the next begins is decided by code, not by a model. The same prompt gives the same bloks every time.",
    epic: "EPIC-010",
    evidence: "packages/core/src/segment"
  },
  {
    id: "multi-range-bloks",
    text: "A rule you stated in four places is clustered into one blok that owns all four ranges, and it is emitted once.",
    epic: "EPIC-011a",
    evidence: "packages/core/src/cluster"
  },
  {
    id: "diagnostics",
    text: "Repetition, contradiction, untestable wording and padding are found on import, each pointing at the text that caused it.",
    epic: "EPIC-012a",
    evidence: "packages/core/src/detect"
  },
  {
    id: "rules-without-checks",
    text: "A rule your prompt states and nothing verifies is called out by name, with the check that would verify it.",
    epic: "EPIC-012b",
    evidence: "packages/core/src/detect/rule-shapes.json"
  },
  {
    id: "decompiler-no-account",
    text: "The decompiler needs no account, and a prompt you paste into it is not stored unless you ask for a link.",
    epic: "EPIC-014",
    evidence: "apps/web/lib/decompile"
  },

  // ─────────────────────────── checks and runs ───────────────────────────
  {
    id: "expected-bloks-are-checks",
    text: "An expected blok compiles to a check rather than to text, so what you asked for and what gets verified cannot drift apart.",
    epic: "EPIC-030",
    evidence: "packages/core/src/check"
  },
  {
    id: "eight-check-kinds",
    text: "Eight kinds of deterministic check, named in plain words: valid JSON shape, one of the allowed values, word limit, character limit, must contain, must not contain, matches a pattern, refuses to answer.",
    epic: "EPIC-030",
    evidence: "packages/core/src/compile/types.ts"
  },
  {
    id: "not-graded-is-not-a-pass",
    text: "A check that could not be graded is reported as exactly that. It is never folded into a pass.",
    epic: "EPIC-030",
    evidence: "packages/core/src/check/grade.ts"
  },
  {
    id: "judge-pinned",
    text: "Where a check needs judgement a model grades it, and that model is pinned by version. Nothing is ever graded by a moving name.",
    epic: "EPIC-033",
    evidence: "apps/worker/src/runs/judge.ts"
  },
  {
    id: "attribution",
    text: "Every failure resolves to the blok that owns the span that caused it, not to the prompt as a whole.",
    epic: "EPIC-032",
    evidence: "apps/web/lib/runs"
  },
  {
    id: "constraint-from-failure",
    text: "Turn a failure into a new constraint blok from the failure itself, with a preview of what it changes.",
    epic: "EPIC-032",
    evidence: "apps/web/lib/runs"
  },
  {
    id: "three-providers",
    text: "Three providers behind one interface — Anthropic, OpenAI and Google — with seven pinned models, each priced from a table that records the day it was read and the page it was read from.",
    epic: "EPIC-042",
    evidence: "apps/worker/src/runs/prices.ts"
  },
  {
    id: "unpriced-model-does-not-run",
    text: "A model missing from that table does not run. Reserving budget against a price we do not have is not a reservation.",
    epic: "EPIC-031",
    evidence: "apps/worker/src/runs/prices.ts"
  },
  {
    id: "byo-keys",
    text: "Bring your own provider keys. They are sealed before they are stored, and the process that serves the web application holds only the public half of the key that opens them.",
    epic: "EPIC-042",
    evidence: "packages/db/src/provider-keys.ts"
  },
  {
    id: "key-verified-before-stored",
    text: "A provider key is stored only after that provider has accepted it, so a typo fails in the settings screen rather than in a run three days later.",
    epic: "EPIC-042",
    evidence: "apps/web/lib/providers"
  },
  {
    id: "heatmap",
    text: "Results pivot by input as well as by check, and every cell is a focusable button that names itself, with a shape as well as a colour.",
    epic: "EPIC-042",
    evidence: "apps/web/lib/runs"
  },

  // ─────────────────────────── versions ───────────────────────────
  {
    id: "versions-automatic",
    text: "A version is minted as you work. Unchanged content writes nothing, one episode of editing is one version, and a run pins the version it ran.",
    epic: "EPIC-040",
    evidence: "packages/core/src/version"
  },
  {
    id: "semantic-diff",
    text: "The difference between two versions reads as \"added constraint blok: no emoji\", not as a wall of changed characters.",
    epic: "EPIC-040",
    evidence: "packages/core/src/version"
  },
  {
    id: "ab-two-versions",
    text: "Compare two versions on the same set of inputs, in one table, and keep the one that wins.",
    epic: "EPIC-041",
    evidence: "apps/web/app/app/pr/[promptId]/versions/page.tsx"
  },
  {
    id: "restore",
    text: "Restore any earlier version. The open draft is pinned first, so the history only ever grows.",
    epic: "EPIC-041",
    evidence: "apps/web/lib/versions"
  },

  // ─────────────────────────── delivery ───────────────────────────
  {
    id: "prompt-behind-a-name",
    text: "Your code calls a function. The wording comes from here, and you change it without touching the code.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src"
  },
  {
    id: "publish-is-a-release",
    text: "Publishing runs the prompt's checks on the model you actually use, and a prompt whose checks fail does not go Live.",
    epic: "EPIC-051",
    evidence: "packages/core/src/publish/gate.ts"
  },
  {
    id: "gate-four-rows",
    text: "The gate has four rows. Failing checks and an incompatible variable contract stop a publish; a cost increase and the size of the change are reported and do not.",
    epic: "EPIC-051",
    evidence: "packages/core/src/publish/gate.ts"
  },
  {
    id: "why-cost-does-not-stop",
    text: "A gate that refuses a four percent cost rise teaches people to go around gates, so cost is reported rather than enforced.",
    epic: "EPIC-051",
    evidence: "packages/core/src/publish/gate.ts"
  },
  {
    id: "publish-anyway-audited",
    text: "Publish anyway exists, it needs a reason typed in words, and it is recorded with the person who did it.",
    epic: "EPIC-055",
    evidence: "apps/web/app/app/pr/[promptId]/deploy/page.tsx"
  },
  {
    id: "undo",
    text: "Undo puts the previous version back, and it is one click.",
    epic: "EPIC-051",
    evidence: "apps/web/app/api/prompts/[promptId]/undo/route.ts"
  },
  {
    id: "live-is-derived",
    text: "What is Live is derived from the record of what was published, not stored beside it, so the history and what your application receives cannot disagree.",
    epic: "EPIC-051",
    evidence: "packages/db/src/publishes.ts"
  },
  {
    id: "resolve-never-waits",
    text: "resolve() is synchronous. It answers from memory, then disk, then what your deploy bundled — the network is a background refresh, never something your call waits on.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src/client.ts"
  },
  {
    id: "never-throws",
    text: "The SDK never throws. A failure is a status on the value you already have, so a bad day here cannot become an exception in your request handler.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src/client.ts"
  },
  {
    id: "fails-safe",
    text: "Your build carries a copy of its prompts. If we are unreachable your application keeps running on the last version it saw.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src/bundled.ts"
  },
  {
    id: "zero-dependencies",
    text: "Both SDKs install with zero dependencies. Nothing of ours reaches your dependency tree except the one package you asked for.",
    epic: "EPIC-054",
    evidence: "packages/sdk-ts/package.json"
  },
  {
    id: "python-parity",
    text: "Python and TypeScript resolve the same published version the same way, proved against a shared set of cases generated from one of them.",
    epic: "EPIC-054",
    evidence: "sdks/python/tests/canonical_golden.json"
  },
  {
    id: "picks-up-in-thirty-seconds",
    text: "A published change reaches a running application in about thirty seconds, with no rebuild and no redeploy.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src/client.ts"
  },
  {
    id: "telemetry-off",
    text: "Telemetry is off unless you turn it on.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src/client.ts"
  },
  {
    id: "not-in-your-path",
    text: "We are not in your traffic path. The SDK hands you the text and your code calls your model provider directly.",
    epic: "EPIC-052",
    evidence: "packages/sdk-ts/src/client.ts"
  },
  {
    id: "build-is-addressed",
    text: "Every published build is addressed by a hash of its own content, and both SDKs re-derive that hash before they use a build they read from disk.",
    epic: "EPIC-050",
    evidence: "packages/core/src/artifact/schema.ts"
  },
  {
    id: "content-address-is-not-a-signature",
    text: "That hash proves a build is intact. It does not prove it is ours, and our threat model says so in as many words rather than implying otherwise.",
    epic: "EPIC-057",
    evidence: "docs/security/sdk-threat-model.md"
  },

  // ─────────────────────────── the CLI ───────────────────────────
  {
    id: "cli-five-commands",
    text: "41p link, pull, check, run and decompile: pick the project once, generate typed prompts, fail a build on a stale one, print exactly what your program would send, and take a prompt apart.",
    epic: "EPIC-053",
    evidence: "packages/cli/src/commands"
  },
  {
    id: "cli-never-writes-the-key",
    text: "41p link writes a project id into .41prc and never your key. A credential in a file that looks like configuration is a credential in a commit.",
    epic: "EPIC-053",
    evidence: "packages/cli/src/commands/link.ts"
  },
  {
    id: "cli-check-exit-codes",
    text: "41p check separates its answers: stale is one exit code with a ten-second fix, and a missing credential is another, because a build that fails the same way for both teaches people to ignore both.",
    epic: "EPIC-053",
    evidence: "packages/cli/src/commands/check.ts"
  },
  {
    id: "cli-run-prints",
    text: "41p run prints the exact bytes your program would send, and calls no model.",
    epic: "EPIC-053",
    evidence: "packages/cli/src/commands/run.ts"
  },
  {
    id: "cli-decompile-offline",
    text: "41p decompile needs no key, no account and makes no request.",
    epic: "EPIC-053",
    evidence: "packages/cli/src/commands/decompile.ts"
  },
  {
    id: "generated-file-is-yours",
    text: "The file 41p pull writes into your project is yours. 41Prompts claims no rights in it.",
    epic: "EPIC-053",
    evidence: "packages/core/src/codegen"
  },

  // ─────────────────────────── security and data ───────────────────────────
  {
    id: "rate-limited",
    text: "The delivery endpoints are rate limited per key, and the limit is counted after a caller is authenticated so that nobody can spend somebody else's allowance.",
    epic: "EPIC-057",
    evidence: "apps/web/lib/rate-limit.ts"
  },
  {
    id: "cache-directory-refused",
    text: "The Python SDK refuses a cache directory other users on the machine can write to, because re-deriving a content address cannot tell you who wrote the file.",
    epic: "EPIC-057",
    evidence: "sdks/python/fortyone"
  },
  {
    id: "threat-models-public",
    text: "Two threat models are written down and published: one for stored provider keys, one for the delivery path.",
    epic: "EPIC-057",
    evidence: "docs/security/sdk-threat-model.md"
  },
  {
    id: "open-source-core",
    text: "The engine, the published build format, both SDKs and the CLI are Apache-2.0. The hosted workbench is not, and nothing open is missing a licence.",
    epic: "EPIC-056",
    evidence: "mirror/README.md"
  },
  {
    id: "retention-decompile",
    text: `A prompt shared from the decompiler is deleted after ${RETENTION.decompile} days by a job that runs whether or not anyone remembers it.`,
    epic: "EPIC-014",
    evidence: "packages/db/src/constants.ts"
  },
  {
    id: "retention-payloads",
    text: `What a provider returned for a run is kept for ${RETENTION.payloads} days and then purged.`,
    epic: "EPIC-031",
    evidence: "packages/db/src/constants.ts"
  },
  {
    id: "retention-run-counts",
    text: `Counts of what you ran are kept for ${RETENTION.runCounts} days.`,
    epic: "EPIC-017",
    evidence: "packages/db/src/constants.ts"
  },
  {
    id: "every-run-recorded",
    text: "Every run records what was sent, which model answered, what it cost, how long it took, and the version of the prompt it ran.",
    epic: "EPIC-031",
    evidence: "packages/db/src/schema.ts"
  },
  {
    id: "budget-caps",
    text: "A run reserves its worst case before it starts and releases what it did not spend. At the cap it refuses rather than queues, because a queue that never drains is an outage that looks like patience.",
    epic: "EPIC-031",
    evidence: "packages/core/src/budgets.ts"
  },

  // ─────────────────────────── plans and billing ───────────────────────────
  //
  // **These are the first claims in this file that are about money**, and the bar is different
  // because the consequence is. A sentence on `/features` that overstates what a check does costs
  // somebody an afternoon; a sentence on `/pricing` that overstates what $29 buys is a thing a
  // customer paid for and did not get. Each of the six below names the code that enforces it, and
  // the two run counts name `plan-gate.ts` rather than the plans table, because a number in a table
  // that nothing reads is not a limit.
  //
  // **The price is unvalidated and this file is not the place that pretends otherwise.** $29 comes
  // from `docs/roadmap.md`, which took it from the mockup; EPIC-005 is cut. ADR-007 says so, the
  // epic report says so, and the claim below says what we charge rather than what it is worth.
  {
    id: "plan-free-runs",
    text: "The Free plan runs 50 suite runs a period. They are counted from the runs themselves rather than from a tally that could drift, and the fifty-first is refused in words that name the number, the plan and the date it starts again.",
    epic: "EPIC-070",
    evidence: "apps/web/lib/runs/plan-gate.ts"
  },
  {
    id: "plan-pro-runs",
    text: "Pro runs 5,000 suite runs a period, on the meter Settings → Billing shows you, against the billing period Stripe is charging you for rather than a month we invented.",
    epic: "EPIC-070",
    evidence: "packages/db/src/billing.ts"
  },
  {
    id: "plan-pro-price",
    text: "Pro is $29 a month for the account. There are no seats to count, because there is nobody to invite yet, and a charge per seat would bill a quantity that is always one and call it a seat.",
    epic: "EPIC-070",
    evidence: "docs/decisions/ADR-007-plans-prices-and-what-a-seat-is.md"
  },
  {
    id: "plan-pro-trial",
    text: "Pro starts with a 14-day trial that grants the plan from the first minute, and cancelling inside it charges nothing.",
    epic: "EPIC-070",
    evidence: "apps/web/lib/billing/checkout.ts"
  },
  {
    id: "plan-byo-on-pro",
    text: "Bringing your own provider key is a Pro feature. A Free account runs on ours instead, inside a spend rail it never has to think about, and a key you have already attached keeps working whatever plan you are on.",
    epic: "EPIC-070",
    evidence: "apps/web/lib/providers/actions.ts"
  },
  {
    id: "plan-cancel-keeps-everything",
    text: "Stop paying and nothing is deleted. Every prompt, version and run stays readable and exportable, publishing to Live keeps working so a lapsed card cannot break your deploy, and new runs fall back to the Free limit.",
    epic: "EPIC-070",
    evidence: "packages/db/src/billing.ts"
  },
  {
    id: "plan-downgrade-at-period-end",
    text: "A cancellation takes effect at the end of the period you paid for, never on the day you click it.",
    epic: "EPIC-070",
    evidence: "packages/db/src/billing.ts"
  },

  // ─────────────────────────── the workbench itself ───────────────────────────
  {
    id: "keyboard-and-touch",
    text: "Every control works by keyboard and by touch, pass and failure are never shown by colour alone, and reduced motion shows the end of an animation rather than skipping it.",
    epic: "EPIC-003",
    evidence: "packages/ui/src"
  },
  {
    id: "api-keys-shown-once",
    text: "An API key is shown once. Rotating one writes two rows rather than editing one, so \"which key was in the field on Tuesday\" has an answer.",
    epic: "EPIC-055",
    evidence: "apps/web/app/app/settings/keys/page.tsx"
  }
];

/** Every claim, by id. Frozen: a page reads this, nothing writes it. */
export const CLAIMS: Readonly<Record<string, Claim>> = Object.freeze(
  Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry]))
);

/** Ordered, for tests that walk the whole set. */
export const ALL_CLAIMS: readonly Claim[] = ENTRIES;

/**
 * The sentence for `id`.
 *
 * Throws on an unknown id rather than returning an empty string: a typo should be a build that
 * stops, not a paragraph that silently disappears from a live page.
 */
export function claim(id: string): string {
  const found = CLAIMS[id];
  if (!found) throw new Error(`unknown claim id: ${id}`);
  return found.text;
}
