<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-901 — Dependency, licence and security audit

Built 2026-09-18/19 by Claude Code, in the advisor's chair as well as the implementer's
(`docs/PROCESS.md`, amendment of 2026-09-15). Branch `epic/901-security-audit`.

## 0. What this is, in one paragraph

`docs/roadmap.md`'s Ongoing row — `pnpm audit`, `pip-audit`, gitleaks, the SBOM and licence gate
output, a key rotation check — has never run in this repository's life. It now runs as one command,
`pnpm audit-run`, reports every check with its own verdict, and **shows only what is new**, because
a monthly check that reports the same thirteen things every month is one nobody reads by March.
The first run's findings are triaged in `docs/security/audit-2026-09.md`. It also found something no
check on the roadmap's line was looking for: **102 files inside proprietary trees were licensed
Apache-2.0 by their own header**, in a repository that was public for a period in September 2026.

## 1. Acceptance criteria

| # | criterion | evidence |
|---|---|---|
| A1 | `pnpm audit-run` runs all five checks and names each with its own verdict | ✅ §2 — the table, 5/5 |
| A2 | A missing tool is **PARTIAL**, and the run says it is not a full pass | ✅ §3.1 — transcript with `gitleaks` off `PATH` |
| A3 | A finding not in the baseline **fails** the run | ✅ §3.2 — proved by removing an entry; `audit.test.ts` "a finding with no baseline entry is new", with the control that the same finding is silent once accepted |
| A4 | A baseline entry matching nothing **also fails** | ✅ §3.3 — proved by adding one; `audit.test.ts` "an entry that matches nothing is stale", plus "only counts an entry stale against its own check" |
| A5 | The key inventory and the tree agree in **both** directions | ✅ `docs/security/key-inventory.md`, 25 names; `audit.test.ts` "documents every credential the code uses" and "uses every credential the inventory documents", with a third test that the agreement is not two empty sets |
| A6 | The proprietary boundary covers every tree `REUSE.toml` declares, with controls | ✅ §4 — `license-gate-boundary.test.ts`, 14 tests, positive and negative controls; and the real-tree control **proved by regression**, §4.3 |
| A7 | Every accidental Apache-2.0 header corrected except the four in `docs/decisions/` | ✅ §4 — 96 corrected, 4 named in `HEADER_EXEMPT`, §8 hands them to you |
| A8 | The month's findings written up | ✅ `docs/security/audit-2026-09.md`; `audit.test.ts` binds every baselined id to it |
| A9 | `node scripts/gates.mjs ci` green on the commit | ✅ §6 |
| A10 | The built app driven by hand and screenshotted | ✅ §5 — `scripts/drive-epic-901.mts`, **35/35**, `docs/epics/reports/screenshots/EPIC-901/` |

## 2. `pnpm audit-run` — the run

```
audit — every check, every result
--------------------------------------------------
  npm-advisories        PASS        810 dependencies, 3 accepted
  python-advisories     PASS        4 audited of 6 exported (2 excluded by an environment marker)
  secrets               PASS        13 raw hits over the whole history, 13 accepted
  licences              PASS        639 dependencies, SBOM written by the gate, 8 accepted
  key-inventory         PASS        25 in use, 25 documented
--------------------------------------------------
  5 checked, 5 passed
```

**What the first run actually found**, before anything was accepted: 3 moderate npm advisories, no
Python ones, 13 gitleaks hits, 17 licence findings and no key inventory at all.
`docs/security/audit-2026-09.md` triages every one. Three things from it are worth repeating here:

1. **`pnpm audit --prod` reports all three advisories and the paths are misleading.** They read
   `apps__web>better-auth>vitest`, which looks like "vitest is a production dependency" and is not:
   `better-auth@1.7.2` declares `vitest` and `drizzle-kit` as **optional peer dependencies**, so
   pnpm walks the peer edge back to our own devDependency. What is true and matters more is in
   `apps/web/Dockerfile`'s own comment — *"Runner keeps the full pruned workspace, devDependencies
   included"* — so both packages **are** installed in the production image, and neither executes
   there. Present on the server, not running.
2. **Nine of the seventeen licence findings were not baselined; they were fixed.** `MIT-0`,
   `BlueOak-1.0.0` and `CC0-1.0` are unambiguously permissive and went into `ALLOWED_LICENSES`.
   A baseline entry is for something accepted *despite* being a concern, and a permanent warning
   about a licence nobody objects to is how a list becomes something people skim. This answers
   EPIC-007's closing open question by name.
3. **All 13 gitleaks hits were opened and read**, not classified by filename. The sealed-box
   placeholder is published *on purpose* and `masterKeysFrom` refuses that exact value when
   `DEPLOY_ENV` is production, so pasting it into a deployment is a process that will not start.

### The design decision that is the whole epic

The baseline's identity for a finding is **rule + path + a SHA-256 of the matched text**, never a
line number. gitleaks' own fingerprint is `commit:file:rule:line`, which changes every time the
surrounding file is edited — and a baseline people regenerate on every commit is a rubber stamp.
`packages/db/src/provider-keys.test.ts` proves the point on the first run: gitleaks reports it at
line 21, where the file now holds something else.

A fixture that moves within its file stays accepted. A fixture that moves to another file re-fires.
**A changed value re-fires**, which is the case that matters.

## 3. The failure paths, proved rather than asserted

### 3.1 PARTIAL when a tool is missing (A2)

`PATH` reduced to a directory holding only `node`, `pnpm`, `uv`, `uvx`, `git` and `sh`:

```
  secrets               PARTIAL     gitleaks is not installed — `brew install gitleaks`
--------------------------------------------------
  1 checked, 0 passed, 1 partial
  secrets did not run.
  This run is NOT a full pass. Say so rather than calling it clean.
```

Same word, same colour and same closing sentence as `scripts/gates.mjs`, deliberately. A second
vocabulary for the same idea is a second thing to learn.

### 3.2 A new finding fails (A3)

One entry removed from the baseline:

```
npm-advisories
  NEW      [moderate] esbuild@0.18.20 — esbuild enables any website to send any requests to the development server and read the response
           packages__db>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild
           id: GHSA-67mh-4wv8-2f99:esbuild

  npm-advisories        FAIL        810 dependencies, 2 accepted, 1 new
```

### 3.3 A stale entry also fails (A4)

One entry added that matches nothing:

```
  STALE    baseline entry matches nothing: GHSA-0000-0000-0000:a-package-that-left
           a dependency that was removed
           Remove it, or find out why the finding went away.

  npm-advisories        FAIL        810 dependencies, 3 accepted, 1 stale baseline entry
```

This is the direction EPIC-072 shipped one-way, noticed, and fixed. An exemption for something that
has gone away is not harmless: it is a decision about a thing nobody can see any more, and it will
silence that id if it ever comes back for a different reason.

## 4. 102 files were licensed Apache-2.0 by accident

`scripts/license-gate.mjs` has treated *"an Apache-2.0 SPDX header appearing on a file inside a
proprietary package, which is a grant by accident"* as a **hard failure** since EPIC-007. It checked
`packages/ui`, `packages/db`, `packages/logger` and `apps/worker`. `REUSE.toml` declared **eight**
trees proprietary, and ADR-002 §1 names `docs/` among them in as many words.

| tree | files declaring Apache-2.0 |
|---|---|
| `docs/` | 91 |
| `scripts/` | 6 |
| `apps/web` | 2 |
| `.githooks/` | 1 |
| root — `SECURITY.md`, `TRADEMARKS.md` | 2, and **deliberate**: `scripts/mirror-dry-run.sh` ships both to the public repository |

**Why it is a grant and not a formatting slip.** REUSE's default precedence is `closest`, so a
file's own header beats the glob. `reuse spdx` reports those 100 files as Apache-2.0 — while
`README.md` says in as many words that `docs/` and `scripts/` are all rights reserved, and the
repository was public for a period in September 2026. **Correcting a header does not un-publish what
was seen**; `README.md` already says that. This is forward-looking and the epic does not pretend
otherwise.

### 4.1 What changed

- The tree list is **read out of `REUSE.toml`**, not written into the gate, so the two cannot
  disagree again.
- **`.githooks/**` added to `REUSE.toml`.** It was covered by no glob at all, and its one file
  satisfied REUSE with a permissive header of its own. A tree with no annotation is compliant only
  for as long as every file in it remembers to carry a header.
- **96 headers corrected.** `docs/epics/plan-EPIC-000.md` needed one **added** rather than changed:
  it had no header, and REUSE was reading a fenced code block on line 109 — an *example* of what a
  public file's header looks like — as the file's own declaration.
- The boundary logic moved to **`scripts/license-boundary.mjs`** so it can be tested. A loop inside
  the gate can be asserted to find nothing, and "finds nothing" is what a broken check also says.

### 4.2 The first version matched prose, and this repository had already paid for that once

It flagged four files that merely *describe* a header — `docs/epics/EPIC-000-repo-scaffold.md`,
`plan-EPIC-007.md`, `EPIC-000-report.md` and **`scripts/license-gate.mjs` itself**, which matches on
its own failure message. EPIC-056 shipped exactly this bug and its own gate caught it (`7f8b67f`).

The check now reproduces REUSE's algorithm rather than approximating it: drop the spans REUSE is
told to skip, then take the first declaration **on a line of its own**. Cross-checked once, by hand,
against `reuse spdx` over the whole tree — the two sets agree exactly, modulo the four exemptions
and `CURRENT.md`, which this epic overwrote. That cross-check is **not** in the test suite: it needs
`uv` and twenty seconds, and a check that skips when a tool is absent reads as a pass.

**A related trap, met while writing the fix.** Spelling out the SPDX tag and the REUSE ignore
markers as literals inside `license-gate.mjs` closed that file's own ignore span 99 lines early,
turned the next line's regex into an SPDX expression, and made `reuse lint` report the gate as
having **no licensing information at all**. Both files now assemble those strings from fragments,
with the reason in a comment.

### 4.3 `git ls-files` reads the index, so a new file is invisible — found by the control

The real-tree assertion was verified the honest way: flip a header in a proprietary-tree file and
watch the test fail. **It passed.** The file was new and untracked, and `git ls-files` reads the
index.

That is `docs/PROCESS.md`'s failure 2 from "Local green is not CI green", where `binary-files.mjs`
reported "486 checked" over a set that did not include the file with the NUL byte in it — arriving
in the next gate to be written. The scan is now the same three-way union `binary-files.mjs` uses:
tracked, staged, and untracked-but-not-ignored. With that in place both the test and the gate fail
on the regression, and pass again when it is reverted.

**This is the single most useful thing in the epic**, and it exists only because the control was run
rather than assumed.

### 4.4 The tests run the modules in a child process

`turbo boundaries` refuses an import that leaves `@41prompts/web`, and it is right to — `CLAUDE.md`
rule 11 makes that guard load-bearing and weakening it for a test would be the wrong trade.
`apps/web/binary-files.test.ts` sets the precedent. One child process runs every scenario and
returns JSON, rather than one per assertion.

## 5. The drive — 35/35

`scripts/drive-epic-901.mts`, against `next start` on 3119 from a real `turbo run build`. Never
`pnpm dev`.

**This epic ships no route and no user-visible string**, so the drive's claim is narrow and stated
narrowly: the built app still serves every public page, styled, and a person who has never signed in
can sign in and create a project. It is not a demonstration of a feature, because this epic has none
— but it rewrote the first three lines of 96 files, two of them inside `apps/web`, and a passing
test suite proves only that the modules still parse.

| # | what | result |
|---|---|---|
| 0 | the server answering is the build just made | ✅ `BUILD_ID` `qWmShJdvg3LQFVHu1G_bQ` verbatim in the HTML. `/healthz` says `"commit":"unknown"` with no `COMMIT_SHA` and cannot identify a local build |
| 1–15 | 15 public routes serve, styled | ✅ 200 each, stylesheet **fetched and measured** at 84,706 bytes — not "a `<link>` exists" |
| 16–30 | the same 15 at 390px | ✅ overflow 0px on every one |
| 31 | `/legal/third-party-notices` still lists dependencies | ✅ 423 packages under 16 licences; expected a no-change, confirmed one |
| 32 | dark mode renders dark | ✅ body `rgb(11, 11, 11)` |
| 33–35 | a fresh account signs in, reaches the workbench, creates a project **through the form** | ✅ `claude-drive-901-…@example.com`, cleaned up at both ends |

Screenshots: `docs/epics/reports/screenshots/EPIC-901/` — `third-party-notices.png`,
`landing-dark.png`, `projects-empty.png`, `project-created.png`, plus `transcript.txt`.

**What the drive does not cover**, stated so nothing here reads as a deployed one: the image build,
the Coolify environment, Traefik, and migrations against the real database. Nothing is pushed
(`CLAUDE.md`), so nothing deploys and **no staging URL is evidence about any of this** — staging is
still serving `da42eee`, 119 commits behind.

## 6. Gates

`node scripts/gates.mjs ci --allow-dirty` on **`f7a5a095`** — see §6.1 for the flag and why.
**16 steps, all passed, 15m58s wall.**

```
CI mode — every gate CI runs, every result
--------------------------------------------------------------------
  checkout
    git clone + checkout f7a5a095       PASS        0m07s
  ci.yml
    pnpm install --frozen-lockfile      PASS        0m16s
    pnpm lint                           PASS        1m11s
    pnpm typecheck                      PASS        1m34s
    pnpm db:migrate                     PASS        0m05s
    pnpm test                           PASS        2m16s
    playwright install chromium         PASS        0m02s
    pnpm e2e                            PASS        8m09s    4 test(s) skipped on darwin
    uv run pytest -q (sdks/python)      PASS        0m36s
  compliance.yml
    reuse lint                          PASS        0m05s
    pnpm boundaries                     PASS        0m06s
    turbo boundaries                    PASS        0m01s
    pnpm forbidden-words                PASS        0m01s
    pnpm binary-files                   PASS        0m01s
    license-gate --sbom                 PASS        0m03s
    pnpm mirror-dry-run                 PASS        1m21s
--------------------------------------------------------------------
  16 step(s), all passed, 15m58s wall
```

Inside that run: `pnpm test` 9/9 packages (`@41prompts/web` **1195 tests**, up 31 — the two new
files); `pnpm e2e` **319 passed, 4 skipped on darwin**, each named by the skip reporter with its
reason; `uv run pytest` 289; `reuse lint` 1292/1292 in the monorepo and **364/364 in the filtered
public tree**, with `Invalid SPDX License Expressions: 0` — which is the check that caught the
fragment-assembly problem in §4.2 when it was still broken.

| local, before the commit | |
|---|---|
| `node scripts/gates.mjs test` | **9/9 PASS**, no PARTIAL, throwaway container |
| `node scripts/gates.mjs typecheck` | **9/9 PASS** |
| `node scripts/gates.mjs lint` | **12/12 PASS** — including dependency-cruiser, turbo boundaries and the forbidden-word grep |
| `pnpm compliance` | **green** — `reuse lint` 1292/1292, licence gate, binary-files, `mirror-dry-run` (289 Python tests in the filtered tree) |
| `pnpm audit-run` | **5/5 PASS** |

### 6.1 The gate needed `--allow-dirty`, and this is why

`app-icon.jpg` sits untracked at the repository root. **It is not this epic's and not mine** —
another Claude Code session shares this worktree — so committing it or deleting it were both wrong.
`gates.mjs ci` treats any dirty tree as a hard stop, so the run used `--allow-dirty`, which the mode
handles exactly right: it still does a clean `git clone` of the **commit**, and says on the summary
that the file was not in it. Since the file is untracked, its absence from the clone is also true of
the commit, so the result is a genuine test of `f7a5a09`. Recorded here rather than left for a
reader to wonder about.

### 6.2 What a green here still does not cover

`gates.mjs ci` prints this every time and `docs/PROCESS.md` says it is part of the result, not a
footer. For this commit:

1. **The runner is slower.** A timing-dependent failure cannot be reproduced on this machine.
2. **The runner is Linux.** The four visual-regression baselines skip on darwin, and the run named
   all four with their reason. **Nothing in this epic changes a rendered pixel** — the only
   `apps/web` files it touched are two test files' first two lines, plus two new test files — so
   the risk here is as low as it gets, but it is still not covered.
3. **`--allow-dirty` reported one uncommitted file was not part of this run**, in its own red line
   in the closing block — `app-icon.jpg`, §6.1. That is the mode being honest about exactly the
   thing it should be honest about.
4. **A `pull_request` run tests the merge, not the branch tip.** Nothing is pushed, so there is no
   such run at all.

And the standing three from `docs/PROCESS.md`'s "The local pipeline": no second machine builds this,
no image is built, and nothing deploys. They wait for your next push.

## 7. New dependencies

**None.** `gitleaks` and `uv`/`pip-audit` are developer tools invoked from `PATH`, not packages, and
a run without them reports **PARTIAL** and names the tool rather than passing quietly. Nothing was
added to any `package.json` except one script, `audit-run`.

## 8. What needs a person, and is not ticked

`docs/AUTONOMOUS.md`: a step that needs a person is skipped and said out loud, in its own numbered
section, with nothing ticked on anyone's behalf.

1. **Four files in `docs/decisions/` still declare Apache-2.0 and should declare the proprietary
   licence** — `ADR-005-build-artifact.md`, `ADR-006-sdk-public-api.md`, `GATE-3.md`, `GATE-5.md`.
   `CLAUDE.md`'s "Never touch without an explicit instruction" list covers `docs/decisions/*` and
   that rule is not one an unattended run may write itself an exception to. They are named one by
   one in `HEADER_EXEMPT` in `scripts/license-boundary.mjs`, and a test asserts the list is exactly
   those four **and that each still needs its exemption**, so the moment you fix one the list has to
   shrink. The change is one line each: `Apache-2.0` → `LicenseRef-41Prompts-Proprietary`.
2. **Rotating any key.** `docs/security/key-inventory.md` lists all 25 and the procedure for each.
   **Last rotated is `never recorded` for every row** — no rotation has happened or been logged
   since 2026-08-26. Three need reading before anyone touches them: `BETTER_AUTH_SECRET` invalidates
   every live session; `KEY_ENCRYPTION_SECRET` re-encrypts nothing, so rotating it without a
   migration makes every stored customer provider key unreadable; `R2_SECRET_ACCESS_KEY` is what the
   nightly backup loop authenticates with.
3. **The vitest 4 bump.** GHSA-82fw-gwwq-j7x9's patched range starts at `4.1.11` and the workspace
   is on `^3.2.7` in ten manifests. Baselined to **2026-12-18** so the decision gets made rather
   than deferred again. It is a real change with a real risk of churn across every suite.
4. **Whether the production image should stop shipping devDependencies.** `apps/web/Dockerfile`
   keeps the full pruned workspace so the entrypoint can run `drizzle-kit` migrations. That is a
   deliberate trade documented in its own comment, and it is why `vitest` and `esbuild` are on the
   server. `output: standalone` plus a separate migration step is the alternative. Not this epic's.
5. **The external review hour** for `packages/core/src/artifact/sha256.ts` is still not done —
   EPIC-057's report §8, unchanged by this epic. A monthly dependency audit is not a code review of
   a hand-written hash.
6. **Every acceptance in `docs/security/audit-baseline.json` is mine, not yours.** `acceptedBy` says
   `Claude Code (advisor's chair, EPIC-901)` on all 24. They are the batch you review, the same way
   `docs/decisions/AUTONOMOUS.md` is; each carries the reasoning and a date it comes back.

## 9. Open questions

1. **Should `pnpm audit-run` ever join a gate?** It is deliberately not in `gates.mjs ci`, because
   that mode's claim is parity with CI and CI runs neither gitleaks nor pip-audit. If it should run
   automatically, the honest place is a scheduled workflow — which costs Actions minutes, and
   `docs/backlog.md`'s EPIC-009 section is the reason that is your call.
2. **Is a month the right cadence?** The roadmap says monthly. The baseline's review dates are 3
   months (advisories), 6 months (licences) and 12 months (fixtures), chosen so the monthly run is
   usually silent and the re-reads are spread out.
3. **The licence findings are platform-specific.** Four of the eight name `-darwin-` packages. A run
   on Linux will report that platform's variants as new and these as stale. That is the audit
   working — the dependency set really is different — but the first Linux run will need a person to
   confirm the swap rather than assume it.

## 10. Verify it yourself

```
pnpm audit-run                      # 5/5, exit 0 when nothing is new
pnpm audit-run --explain            # what each check runs, without running it
pnpm license-gate                   # proprietary boundary intact (4 packages, 9 trees, 4 exemptions)
pnpm reuse-lint                     # 1292/1292
pnpm --filter @41prompts/web exec vitest run audit license-gate-boundary   # 31 tests
node scripts/gates.mjs ci --allow-dirty   # the only CI there is; see §6.1 for the flag

# the drive
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
npx turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3119)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/901.env
set -a && . /tmp/901.env && set +a
pnpm --filter @41prompts/web start --port 3119 &
npx tsx scripts/drive-epic-901.mts
```
