<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-901: dependency, licence and security audit

Written 2026-09-18, before any code, per `CLAUDE.md` ("Plan first into `docs/epics/plan-EPIC-xxx.md`;
stop and show the plan before implementing") and `docs/AUTONOMOUS.md` step 2.

## 0. What the reconnaissance already found

The epic was written **after** running the five checks by hand, so the plan is not a guess about what
they will say. Everything below is measured on `29dd9e9`.

| check | result |
|---|---|
| `pnpm audit` | **3 moderate**, 0 high, 0 critical, over 810 workspace dependencies |
| `pip-audit` | **no known vulnerabilities**, 26-line resolved set |
| `gitleaks detect` | **13 findings**, 250 commits, 9.13 MB scanned |
| `license-gate` | proprietary boundary intact (4 packages); **17 non-allow-list licences** (private only); SBOM 639 components |
| key inventory | **does not exist**; 32 credential-bearing environment names are read across the tree |

And one thing no check was looking for:

| | |
|---|---|
| `reuse spdx`, read per tree | **102 files in proprietary trees declare Apache-2.0 in their own SPDX header** — 91 under `docs/`, 6 under `scripts/`, 2 under `apps/web`, 1 under `.githooks/`, and `SECURITY.md` + `TRADEMARKS.md` which are deliberate |

## 1. The three npm advisories, triaged before deciding what to build

| advisory | package | how it reaches us |
|---|---|---|
| GHSA-67mh-4wv8-2f99 (5.3) | `esbuild@0.18.20` | `packages/db` → `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild`. Dev-server request forgery; the dev server never runs here. |
| GHSA-82fw-gwwq-j7x9 (5.9) | `vitest@3.2.7` | root devDependency, ten manifests. Path traversal via `@vitest/mocker`'s redirect mock; needs a test run to be executing. |
| GHSA-82fw-gwwq-j7x9 (5.9) | `@vitest/mocker@3.2.7` | same advisory, same tree |

**The part that is not obvious, and that the report must get right.** `pnpm audit --prod` reports all
three, through `apps__web>better-auth>vitest`. That reads as "vitest is a production dependency" and
it is **not**: `better-auth@1.7.2` declares `vitest` and `drizzle-kit` as **optional peer
dependencies**, so pnpm walks the peer edge back to our own devDependency and prints a production
path for a development package.

What *is* true, and matters more, is in `apps/web/Dockerfile`'s own comment:

> Runner keeps the full pruned workspace, **devDependencies included**, rather than a slim
> `output: standalone` bundle

So `vitest` and `esbuild` **are installed in the production image** — not because better-auth needs
them, but because the image ships the whole workspace so the entrypoint can run `drizzle-kit`
migrations. Neither *executes* there. The honest severity is "present on the server, not running":
a supply-chain surface rather than a live vulnerability. That distinction goes in the triage document,
not lost in a one-line baseline entry.

**Not fixed here.** The patched range is `>=4.1.11` — a major bump of the test runner in ten
manifests. Out of scope, in the baseline, with a review date.

## 2. The 13 gitleaks findings

Every one is read individually before it is baselined; the risk of this file is baselining a real key
because its neighbours were fake.

| file | what it is |
|---|---|
| `packages/cli/src/commands/{run,link,pull,check}.test.ts`, `main.test.ts` | five `const KEY = "…"` test fixtures |
| `apps/web/e2e/env.mjs` ×2 | the `KEY_ENCRYPTION_*` placeholders `playwright.config.ts` injects, which `docs/PROCESS.md` documents by name |
| `packages/db/src/sealed-box.ts` | `PLACEHOLDER_MASTER_SECRET` |
| `apps/web/e2e/providers.spec.ts` | `GOOD_KEY` fixture |
| `apps/worker/src/runs/test-key.test.ts` | fixture |
| `scripts/drive-epic-042.mjs` | the same placeholder, passed to a drive |
| `packages/logger/src/scrub.test.ts` | a synthetic GCP-shaped key the **scrubber test** exists to redact |
| `packages/db/src/provider-keys.test.ts` | `OPENAI_KEY` fixture |

Each is confirmed by reading the file, not by the filename. The baseline records the path, the rule,
a fingerprint, and one sentence of why.

## 3. The 17 licence findings

`MPL-2.0` (4), `MIT-0` (3), `LGPL-3.0-or-later` (1), `FSL-1.1-MIT` (2), `CC-BY-4.0` (1),
`BlueOak-1.0.0` (5), `CC0-1.0` (1). All in **private** packages; the gate already treats them as a
warning rather than a block, per EPIC-007 decision 4. The audit's job is the "actual look" EPIC-007
asked for: which are file-level copyleft that only matters if we modify and distribute the file
(MPL), which is a dynamic-linking question that does not arise for a build tool (`sharp`'s libvips),
which is source-available-with-a-delay (`@sentry/cli`'s FSL), and which are permissive licences the
allow-list simply has not been told about (`MIT-0`, `BlueOak-1.0.0`, `CC0-1.0`).

**Three of those — `MIT-0`, `BlueOak-1.0.0`, `CC0-1.0` — are unambiguously permissive** and belong in
`ALLOWED_LICENSES`, which removes 9 of the 17 warnings permanently rather than baselining them.
That is a one-line change to `scripts/license-gate.mjs` with its reason in a comment.

## 4. The build order

| # | step | files |
|---|---|---|
| 1 | epic file, this plan | `docs/epics/EPIC-901-*.md`, `CURRENT.md`, this |
| 2 | `docs/security/key-inventory.md` — written first, because check 5 reads it | new |
| 3 | `scripts/audit.mjs` + `pnpm audit-run` | new, `package.json` |
| 4 | `docs/security/audit-baseline.json`, populated from the triage | new |
| 5 | `apps/web/audit.test.ts` — A2, A3, A4, A5, A8 | new |
| 6 | `license-gate.mjs`: proprietary boundary over every `REUSE.toml` tree; three licences added to the allow-list | `scripts/license-gate.mjs` |
| 7 | `apps/web/license-gate-boundary.test.ts` — A6, both controls | new |
| 8 | the 100 header corrections | `docs/**`, `scripts/**`, `apps/web/*.test.ts`, `.githooks/commit-msg` |
| 9 | `docs/security/audit-2026-09.md` | new |
| 10 | gates, drive, report, session log, backlog cell | |

## 5. Design decisions taken in the plan

**`audit.mjs` shells out; it does not reimplement.** `pnpm audit`, `pip-audit`, `gitleaks` and
`license-gate.mjs` are the checks. The script's whole job is to run each one, normalise its output
into a finding, diff that against the baseline, and report. Anything it computes itself is a second
implementation that can disagree with the tool — which is `_canonical.py`'s lesson from EPIC-054,
paid for once already.

**A finding's identity is a fingerprint, not a line number.** `gitleaks` reports `File:StartLine`;
lines move every time a file is edited, and a baseline keyed on them would go stale on every commit
and teach everyone to regenerate it — which is how a baseline becomes a rubber stamp. The key is
`rule + file + a hash of the matched text`, so moving the fixture keeps it accepted and **changing
the secret does not**.

**Both directions, in both files.** A finding with no baseline entry fails; a baseline entry with no
finding fails. Stated in the epic as A3/A4 because EPIC-072 shipped a one-way Lighthouse waiver,
noticed it, and made it two-way — and `docs/decisions/AUTONOMOUS.md` records why.

**`PARTIAL` copies `gates.mjs` exactly.** Same word, same amber, same closing sentence that the run
is not a full pass. A second vocabulary for the same idea is a second thing to learn.

**Not wired into `gates.mjs ci`.** Argued in the epic's Out of scope. `pnpm audit-run` stands alone
and the monthly cadence is a calendar, not a gate.

## 6. Risks

| risk | handling |
|---|---|
| **Baselining a real secret.** | Every one of the 13 is read in full before it is entered, and the fingerprint covers the matched text so a changed value re-fires. |
| **102 header edits break a test that reads a header.** | `legal-entity.test.ts` asserts `SPDX-FileCopyrightText` lines; only `SPDX-License-Identifier` changes. `reuse lint` and `pnpm license-gate` both run before the commit. |
| **The four `docs/decisions/` files cannot be fixed.** | Named for Soroush in the report; carried in the baseline with his name and no silent expiry. The gate would otherwise be red and unmergeable, which is stop 1. |
| **`gitleaks`/`uv` absent on a future machine.** | That is A2. The run says PARTIAL and names the tool. |
| **Scope creep into EPIC-900.** | Dead code, upgrades and the infra drill are out of scope in writing. |

## 7. What this plan does not cover

The browser drive. This epic ships no route and no user-visible string, so the drive is A10's smaller
claim: the built app still renders after 102 files changed licence headers. That is a real risk worth
one screenshot — `docs/PROCESS.md`'s twenty-epic outage was a build-and-asset failure — and it is not
the same thing as driving a feature.
