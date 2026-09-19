<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-900: Tech-debt sweep

Written 2026-09-19, before any code, per `CLAUDE.md`'s "Plan first".

## The shape of the work

Four commits on `epic/900-tech-debt-sweep`, in this order, because each one has to be green before
the next is worth writing:

| # | commit | why this order |
|---|---|---|
| 1 | the epic file and this plan | `docs/AUTONOMOUS.md` step 1–2 |
| 2 | `scripts/dead-code.mjs`, its tests, and the three wirings | the gate has to exist and fail before the fixes mean anything |
| 3 | the 39 findings resolved | now provable: the gate goes red → green |
| 4 | the dependency upgrades | last, because it is the one that can move a visual baseline, and it wants the full e2e behind it |

Then: `gates.mjs ci`, the drive, the report, the merge.

## 1. The gate

`scripts/dead-code.mjs`. Pure Node, no dependency — the repository has refused a new one for this
shape of job four times (`forbidden-words.mjs`, `binary-files.mjs`, `license-gate.mjs`, `audit.mjs`)
and this is a file scan.

**What it scans.** `git ls-files`, plus staged and untracked-not-ignored, which is EPIC-901's
finding restated: `git ls-files` reads the **index**, so a file written and not yet staged is
invisible and the gate reports a pass it has not earned (`docs/PROCESS.md`, "Local green is not CI
green", failure 2). `mirror/` is excluded: it is the public tree's overlay, and its files are read
by a tree that does not exist here.

**What counts as a declaration.** `export const|let|var|function|class NAME`. Not `type` and not
`interface` — the epic's Out of scope says why.

**What counts as a use.** The name appearing in any **other** tracked file of any text kind —
`.ts`, `.tsx`, `.mts`, `.mjs`, `.js`, `.json`, `.md`, `.py`, `.sh`, `.yml`. Deliberately generous:
a false negative costs nothing and a false positive costs somebody an argument with a gate. The
three deletions in step 3 are each confirmed by `git grep` over the *whole* repository first.

**Exemptions, and there are two kinds.**

- `CONVENTION` — names a framework calls rather than imports: Next's `generateMetadata`,
  `generateStaticParams`, `GET`/`POST`/…, `middleware`, `register`, `metadata`, `viewport`;
  Sentry's `onRequestError`, `onRouterTransitionStart`. These are a **class**, not an allow-list:
  they are never findings and never need an entry. A4 proves the class holds by asserting the real
  tree passes with none of them in `ALLOWED`.
- `ALLOWED` — a named export kept deliberately. `{ file, name, why }`. Checked both ways: an entry
  matching no live export fails, exactly as `docs/security/audit-baseline.json` does.

**`--explain`** prints the roots, the declaration pattern, the two exemption kinds and the current
`ALLOWED`, and runs nothing. `audit.mjs --explain` is the precedent.

**Tests** — `scripts/dead-code.test.mjs`, `node --test`, against fixture trees in a temp directory,
never the real one, plus three assertions about the real tree:

1. a lone export in a fixture tree **fails**; the same tree with an `ALLOWED` entry **passes** (A2);
2. an `ALLOWED` entry matching nothing **fails** (A3);
3. `generateMetadata`, `GET`, `middleware` and a default export in fixture `page.tsx` do **not**
   fire (A4), and the real tree carries none of them in `ALLOWED` (A4's second half);
4. **parity**: the string `dead-code` appears in `package.json`'s `compliance` script, in
   `.github/workflows/compliance.yml`, and in `scripts/gates.mjs`'s step list — all three or the
   test fails (A6). This is the one test that is about three files rather than about the gate, and
   it is the whole reason the wiring is one commit.

`node --test` rather than vitest: this is a `scripts/` file, `scripts/` is outside every package's
vitest project, and `forbidden-words.test.mjs` already established the shape.

## 2. The 39

Resolved one at a time, in three classes:

- **Delete (3):** `detectPatterns` (`packages/core/src/detect/detect.ts`), `checkCountForRun`
  (`packages/db/src/versions.ts`), `variablesForOwner` (`apps/web/lib/variables/queries.ts`). Each
  confirmed at exactly one `git grep` hit — its own declaration — before it goes.
- **De-export (the rest):** used inside their own file; the keyword was the only thing making them
  a surface. `tsc` is the control, per package.
- **`ALLOWED` (however many survive the first two):** anything whose export is a deliberate contract.
  Expected to be a short list; each entry gets a sentence somebody can disagree with.

Public-package care: `packages/core` and `packages/sdk-ts` are Apache-2.0 and their surfaces are
frozen by ADR-005 and ADR-006 — but that surface is `index.ts`, and nothing here touches it.
`sdk-ts`'s `frozen.test.ts` is the control and must stay green.

## 3. The upgrades

`pnpm update -r` constrained to the same major, then the four gates. The set, from
`pnpm outdated -r` on 2026-09-19: `@ai-sdk/{anthropic,google,openai}`, `ai`, `better-auth`, `next`,
`prettier`, `@aws-sdk/client-s3`, `@sentry/{nextjs,node}`, `@types/react`, `@types/react-dom`,
`@typescript-eslint/{eslint-plugin,parser}`, `dependency-cruiser`, `jsdom`, `pg-boss`,
`posthog-node`, `react`, `react-dom`, `resend`, `turbo`.

Held, with the reason in the report: `eslint` 9→10, `@eslint/js` 9→10, `typescript` 5→7,
`vitest` 3→4, and **`@types/node` 22→26, which is not staleness** — `engines` pins Node 22.

The risk in this set is React 19.2→19.3 and Next 16.3.4→16.3.5 under a `fullPage` visual baseline.
If a baseline moves it is regenerated in `mcr.microsoft.com/playwright:v<version>-noble`, never as
a `-darwin` file (`docs/PROCESS.md`).

## 4. CLAUDE.md

Two edits, both factual: `packages/cli-unscoped` into the Stack list and into rule 11; `pnpm
audit-run` into Commands. Then the file is read end to end against the tree — the Definition of Done
says "this file is still accurate", and the only way to answer that is to check every claim, which
this plan's survey already did for the naming, vocabulary, blok-kind and id-prefix lines.

## 5. What this plan does not do

The infra drill. It needs the box and several mutating commands, each one command/one yes, and the
R2 credentials are in Coolify. Report §, with the exact commands, and unticked.

## Risks

- **The gate fires on something legitimate nobody thought of.** Mitigated by scanning every text
  file rather than only TypeScript, and by `ALLOWED` existing before the first fix.
- **A dependency upgrade breaks a visual baseline**, which cannot be regenerated on darwin. Mitigated
  by doing the upgrade last and by the container procedure being written down already.
- **A concurrent session's untracked file blocks `gates.mjs ci`.** It already does — `app-icon.jpg`.
  `--allow-dirty` with that file named in the report, as EPIC-901 did on 2026-09-19.
