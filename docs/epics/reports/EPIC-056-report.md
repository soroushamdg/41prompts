<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-056 — report

**The open-source split: a public repository that is real, and a copyright line that names somebody.**
Branch `epic/056-open-source-split`. Stage 5b. Written 2026-09-18.

## 0. The one-paragraph version

`41Prompts Inc.` is now the named copyright holder in every licence header, `LICENSE` and `NOTICE`
in the repository — 423 header lines across 414 files, plus nineteen licence bodies — and the site
footer carries the `©` line that EPIC-016 drew from the mockup and EPIC-017 left out, both times
because there was no company to name. The public tree can be extracted with its real history,
promoted to its own root, installed, tested **and licence-linted** standalone, with all six
publishable distributions in it. Publishing is wired and has not happened: two of the six names are
still unregistered, and **creating the repository, registering them, enabling trusted publishing and
pressing publish are all yours** — §8.

**Four defects were found, none of which had ever failed anything**, and the epic is mostly about
those: the mirror was missing a package that can only be published from the repository it was
missing from; the licence gate was filtered on a package name that does not exist; three root config
files had no licence information at all in the public tree; and my own `SECURITY.md` invented a
second vulnerability-reporting address while the live site already publishes one.

## 1. What was built

| | |
|---|---|
| **The holder, named** | 423 `SPDX-FileCopyrightText` lines; four proprietary `LICENSE` bodies; `LICENSES/LicenseRef-41Prompts-Proprietary.txt`; six `NOTICE` files; `REUSE.toml`'s supplier; `CLAUDE.md`'s naming rule |
| **The footer's `©` line** | `apps/web/app/site-chrome.tsx`, using `.site-foot-legal`, unused in `landing.css` since EPIC-016 |
| **URLs re-pointed** | six manifests × three fields + `REUSE.toml`'s download location → `41prompts/41prompts` |
| **The mirror, for real** | `packages/cli-unscoped` added; `mirror/` promoted to the public root by `--path-rename`; the tree asserted present as well as absent; the public tree's own `pnpm compliance` run |
| **The public root** | `mirror/README.md`, `package.json`, `pnpm-workspace.yaml`, `CONTRIBUTING.md`, `REUSE.toml`, `LICENSE`, `NOTICE` |
| **Governance** | root `DCO`, `SECURITY.md`, `TRADEMARKS.md`; `CONTRIBUTING.md` corrected from four packages to six distributions |
| **Publishing** | `mirror/.github/workflows/publish-npm.yml`, `publish-pypi.yml`, `dependency-review.yml` — OIDC trusted publishing, no token, every job guarded on the repository |
| **Quickstarts** | `## Three steps` in all six distribution READMEs |
| **Two tests** | `apps/web/legal-entity.test.ts`, `apps/web/public-distributions.test.ts` |

## 2. Acceptance criteria

| | criterion | evidence |
|---|---|---|
| A1 | no placeholder outside a named allow-list | `legal-entity.test.ts` — "is named on every licence header" and "nothing else has acquired the placeholder" |
| A2 | every proprietary `LICENSE`, all `NOTICE`s, `REUSE.toml` name the holder; Apache appendix untouched | `legal-entity.test.ts` — four cases including "is NOT written into the Apache-2.0 appendix" |
| A3 | `pnpm reuse-lint` clean with no placeholder in a header | 1240/1240 files compliant, three licences in use |
| A4 | `CLAUDE.md`'s rule names the holder, drops "until incorporation" | `legal-entity.test.ts` — "is the supplier in REUSE.toml and the rule in CLAUDE.md" |
| A5 | the footer renders the line | `site-chrome.test.tsx` ×3, **and** the drive on seven routes — §5 |
| A6 | six manifests + `REUSE.toml` name `41prompts/41prompts` | `public-distributions.test.ts` ×7; `sdks/python/tests/test_packaging.py` inverted, §4.3 |
| A7 | no `soroushamdg/41prompts` outside `infra/`, `.github/`, `docs/` | `git grep -n "soroushamdg/41prompts" -- . ':!infra' ':!.github' ':!docs'` → empty |
| A8 | `packages/cli-unscoped` survives the filter; six distributions present | `pnpm mirror-dry-run`, 4 npm packages tested + 289 Python tests |
| A9 | a distribution missing from the script fails a test | **proved to fire** — §4.2 |
| A10 | `DCO`, `SECURITY.md`, `TRADEMARKS.md` exist, licensed, in the mirror | `reuse-lint`; the dry-run's required-paths check |
| A11 | `CONTRIBUTING.md` names six, matching the workspace | `public-distributions.test.ts` ×7 |
| A12 | each README carries a three-step quickstart | `public-distributions.test.ts` ×6 |
| A13 | the publish workflows cannot run in the private repository | `public-distributions.test.ts` — per **job**, not per file |
| A14 | `pnpm mirror-dry-run` passes | §3 |
| A15 | `gates.mjs ci` green, every gate | §3 |
| A16 | the drive, built app, fresh user, screenshots | §5 — 16/16 |
| A17 | a numbered section of what needs a person, nothing ticked for them | §8 |

## 3. Gates

`node scripts/gate-run.mjs` → it reads `gates.mjs`'s own usage line, finds a CI-parity mode, and runs
`gates.mjs ci` alone.

**Run 2, the one this merges on** — see §3.1 for why there were two.

```
  16 step(s), all passed
```

Every step: checkout, `pnpm install --frozen-lockfile`, lint, typecheck, `db:migrate`, test,
`playwright install chromium`, `pnpm e2e`, `uv run pytest`, reuse lint, `pnpm boundaries`,
`turbo boundaries`, forbidden-words, binary-files, `license-gate --sbom`, `pnpm mirror-dry-run`.

**The closing block is part of the result, and one of its two caveats lands on this epic.** It says
the four visual-regression baselines are `-linux.png` and their specs skip on darwin, so a layout
change can pass locally and fail CI. **This epic is a layout change** — the footer grew a paragraph,
the landing baselines are `fullPage`, and a full-page screenshot that gets taller fails on image
dimensions regardless of `maxDiffPixelRatio`. §4.4 is what was done about it.

The second caveat — the runner is slower, so a load-only failure passes here — is not engaged by
anything in this epic.

### 3.1 The gate ran three times, and run 2 caught a real defect in this epic's own test

| run | commit | result |
|---|---|---|
| 1 | `04c798b` | green, 16/16, 10m59s — but started before two further changes landed, and `gates.mjs ci` tests a **commit**, so it is not evidence about the merged tree |
| 2 | `2afe50c` | **FAILED**, `pnpm test`, 10m54s — see below |
| 3 | `7f8b67f` | **green, 16/16, 10m46s** — the one this merges on |

**Run 2 failed on `apps/web/legal-entity.test.ts`, which this epic wrote, catching
`docs/decisions/AUTONOMOUS.md`, which this epic also wrote.** Two assertions, one cause:

```
× the copyright holder > is named on every licence header, with no placeholder left anywhere
  → expected [ 'docs/decisions/AUTONOMOUS.md:134' ] to deeply equal []
× the historical record > still says what it said, and nothing else has acquired the placeholder
  → a new file carries the placeholder: expected [ Array(2) ] to deeply equal []
```

The test asked whether a line **contained** `SPDX-FileCopyrightText` and the placeholder. Line 134 is
this epic's own ruling about the substitution, which quotes both in one markdown table row. **A
document explaining that headers were rewritten is not a header that was missed.**

The fix is a narrowing and not a widening: a header is a line that *is* one — beginning, after
nothing but whitespace and a comment marker (`//`, `#`, `*`, `--`, `<!--`, `;`), with the tag. A
table row begins with `|`; a sentence begins with a word. And because narrowing a matcher whose job
is catching something is how a check stops catching it, `isAnSpdxHeader` now has nine control cases —
six forms it must still read as a header, three it must not.

Two files were then added to the allow-list because they are this epic's own paperwork and can only
say what they say by quoting the string: `docs/decisions/AUTONOMOUS.md`, and the drive's own
`terminal-transcript.txt`, which records that the placeholder is absent from every served page.

**Run 1 passed because the rulings had not been committed yet.** This is the second time in this
epic that a check written here fired on something real before a human read it, and the first time it
fired on me.

### 3.1a The one commit after the green gate, and what it is answerable to

EPIC-057's rule: a **docs-only** commit after a green gate records which gates it is answerable to
and runs those; anything touching code gets a fresh run, not a table. The only commit after run 3 is
this report's own run-3 row. It is docs-only — `git diff --stat` is one file under `docs/`.

| gate | reads this change? | result |
|---|---|---|
| `pnpm test` | **yes, and this one is not optional here** — `apps/web/legal-entity.test.ts` walks every tracked file, `docs/` included, which is exactly how run 2 failed | re-run, 9/9 |
| `pnpm binary-files` | yes — its roots include `docs/` | re-run, clean |
| `reuse lint` | yes — every file needs licence information | re-run, compliant |
| `pnpm forbidden-words` | no — its roots are `packages/ui/src`, `apps/web/app`, `apps/web/lib`, `packages/sdk-ts/src`, `packages/cli/src`, `sdks/python/fortyone` | not re-run |
| lint, typecheck, e2e, pytest, boundaries, turbo boundaries, license-gate, mirror-dry-run | no — no source, no manifest, no lockfile, and `docs/` does not survive the mirror filter | not re-run |

### 3.2 `pnpm mirror-dry-run`, in more detail

It is one of the sixteen and it is the one that carries this epic:

```
[mirror-dry-run] confirming no proprietary path survived the filter
[mirror-dry-run] confirming everything the public repository needs DID survive
[mirror-dry-run] confirming the public root manifest is the public one, not the monorepo's
   Files with copyright information: 364 / 364
   ✔ no dependency violations found (213 modules, 553 dependencies cruised)
   Tasks: 4 successful, 4 total          (core, cli, cli-unscoped, sdk)
   289 passed in 24.48s                  (sdks/python)
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

## 4. What went differently, and what it cost

### 4.1 The mirror could not have published the package it was missing

`scripts/mirror-dry-run.sh`'s `--path` list did not include `packages/cli-unscoped`. That package
publishes to npm as `41p`, with `"provenance": true` and a `prepublishOnly` that passes only when
`GITHUB_REPOSITORY = 41prompts/41prompts` — so **its source was absent from the one repository it is
permitted to be published from**.

Nothing failed. The filtered tree installed and tested perfectly, because a tree with a package
missing is a smaller working tree. The old script checked only that forbidden paths were **absent**;
there was no check that anything in particular was **present**. Both halves exist now.

### 4.2 The control found a second thing, which is why controls are run

A9 asks for the completeness check to be *proved to fire*. Removing `--path packages/cli-unscoped`
and its required-paths entry produced **one** failure where two were owed. The "asserted present in
the filtered tree" test sliced the script from `for required in` **to the end of the file**, and a
later `echo` line happens to name the same directory — so it passed for a package that had been
removed. Narrowed to the `for required in ... ; do` header exactly; the control now fails two and
passes 41 restored.

A test that passes for the wrong reason is the failure this repository has recorded more than any
other. It was found in the two minutes spent running the control rather than asserting it.

### 4.3 `license-gate.mjs` has been checking two packages while claiming four

Written while giving `dependency-review.yml` an allow-list and checking it against the gate it
claimed to match — the first draft added `CC0-1.0` and `BlueOak-1.0.0`, which are not on the gate's
list, and reading the gate to correct that is what surfaced this:

```js
const PUBLIC_PACKAGES = ["@41prompts/core", "@41prompts/cli", "@41prompts/sdk-ts"];
```

`@41prompts/sdk-ts` is the **directory**. The package is `@41prompts/sdk`. Measured rather than
argued: `pnpm --filter @41prompts/sdk-ts exec node -e ...` answers *"No projects matched the filters"*,
and pnpm quietly proceeds with the filters that did match. So since EPIC-007 the gate has covered
`core` and `cli` — and **not the SDK**, the one package whose code is inlined into somebody else's
application, nor `41p`, which did not exist then.

Corrected to all four, by package name. **The result is unchanged today**: all four have zero
production dependencies, `0 public-package dependencies`, which is precisely why nothing noticed for
eleven epics. `public-distributions.test.ts` now asserts the list equals what the workspace
publishes.

### 4.4 The visual baselines, and the gate's own caveat

The two `landing-*-linux.png` baselines are `fullPage` screenshots of the page whose footer this epic
changed, and they skip on darwin. `docs/PROCESS.md` has the container procedure and EPIC-016's report
has the commands. Regenerated inside `mcr.microsoft.com/playwright:v1.63.0-noble` — see §4.5 for what
that cost and what was checked.

**Why this was not left for Soroush's next push.** A stale baseline is a red CI run on a diff that is
expected, arriving after the push rather than before it, which is the exact failure mode
`CLAUDE.md`'s "Nothing is pushed" section exists to remove.

### 4.5 Docker did not fit, again, and the fix was the documented one

`mcr.microsoft.com/playwright:v1.63.0-noble` needs more than 2 GB and Docker Desktop's VM had 1.7 GB
free — the same wall EPIC-016 hit. `docs/PROCESS.md` sanctions reclaiming space and says to check
what is attached first. Checked: three volumes are referenced by running containers
(`rileyhost_postgres_data`, `rileyhost_redis_data`, one anonymous), and 31 were dangling.
`docker volume prune -f` reclaimed 1.766 GB, taking the VM from 1.7 GB to 3.3 GB free, and the image
fitted. **No named volume and no running container was touched.**

### 4.6 `SECURITY.md` invented an address the site does not use

The first draft told reporters to write to `security@41prompts.ai`. `apps/web/lib/site/legal.ts` has
told users since EPIC-017 to report vulnerabilities to `privacy@41prompts.ai`, and that page is live.

Two addresses for one thing is worse than an imperfect one: a report reaches whichever the finder
happened to read, and one of the two inboxes is watched less. `SECURITY.md` uses the published
address and says why. **Neither alias exists yet** — `privacy@41prompts.ai` is already on the
handover as a Cloudflare routing rule Soroush owes, and this adds nothing new to that.

### 4.7 The landing page refused the footer, and was right to

Two assertions in `apps/web/app/page.test.tsx` failed the moment the `©` line rendered:

1. **"carries no customer counts."** The pattern `\b\d[\d,.]*\s*(?:\+|k\b|m\b)?\s*(?:…|prompts)` took
   the `41` out of `41Prompts` and read `Prompts` as the noun — **the product's own name scanned as a
   count of prompts.** Fixed with a `\b` before the alternation: a word boundary cannot fall between
   `1` and `P`, both word characters.
2. **"shows only numbers that are facts about the product."** `2026` was unlisted. That test is
   designed to be answered by listing the number with its reason, which is what was done.

Narrowing a pattern whose whole job is catching something is how a check quietly stops catching it,
so it now has the positive control it never had: seven phrasings it must still catch
(`1,200 teams`, `5k users`, `10,000+ prompts`, …) and four it must ignore.

### 4.8 The public tree needed its own `REUSE.toml`, and its own compliance run

The monorepo's `REUSE.toml` declares `LicenseRef-41Prompts-Proprietary` over `apps/**`,
`packages/db/**`, `docs/**`, `infra/**` and `scripts/**` — none of which exist in the public tree.
Filtering it through would have put a proprietary licence declaration, and the licence text it names,
into a repository where every file is Apache-2.0. `mirror/REUSE.toml` replaces it and `LICENSES/` is
filtered file by file so the proprietary text stays behind.

Then `pnpm compliance` was added to the dry-run, and **failed on its first run**: `.dependency-cruiser.cjs`,
`eslint.config.js` and `turbo.json` had no copyright or licence information in the public tree at all,
361 of 364. They had been covered by the one file that deliberately does not travel. The tests were
green in both runs — which is the whole argument for running the public tree's own compliance script
and not only its tests.

## 5. The drive

Against the **built** app (`turbo run build --filter=@41prompts/web`, then `next start --port 3118`),
never `pnpm dev`. `scripts/drive-epic-056.mts`. **16 of 16.**

```
PASS  the server answering is the build just made — BUILD_ID snzwfxe3armouy1Z5JcS1 is in the HTML
PASS  / renders the copyright line — HTTP 200 · 1 line(s) · "© 2026 41Prompts Inc."
      … and /contact, /guides/…, /legal/terms, /legal/privacy, /legal/sub-processors, /legal/security
PASS  no served page shows the placeholder that stood here until today
PASS  the copyright line has a left gutter at 390px — left edge at 24px
PASS  the copyright line has a right gutter at 390px — right edge 24px from the viewport
PASS  no horizontal page scroll at 390px — scrollWidth − clientWidth = 0px
PASS  the line is painted and sized in dark mode — colour rgb(129, 126, 119) · 12.5px · height > 0: true
PASS  a fresh account reaches the workbench on the built app — landed on /app/projects
PASS  the signed-in workbench has no footer, so no line is expected there
```

Screenshots: `docs/epics/reports/screenshots/EPIC-056/`, five PNGs and the transcript.

**`/healthz` cannot identify a locally built app** — it answers `"commit":"unknown"` with no
`COMMIT_SHA`. `apps/web/.next/BUILD_ID` appearing verbatim in the returned HTML is the proof, and it
is check zero.

**The 390px checks are not ceremony.** `BUG-069` was a control sitting flush against the viewport
edge in the sibling chrome, found by driving and not by any test, and a footer is the same risk.

**What the drive does not cover**: the image build, the Coolify environment, Traefik, migrations
against the real database. Nothing is pushed, so nothing deploys and no staging URL is evidence about
any of this. **It also cannot cover the split itself** — §8.

## 6. Decisions

Twelve, in `docs/decisions/AUTONOMOUS.md`, appended not edited. The three worth reading first:

1. **Historical prose is not rewritten.** Nineteen matches in committed reports, session logs, plans
   and a specialist review describe the placeholder as a fact of their own date. `ADR-002` is left for
   a second reason as well — `docs/decisions/*` is on the never-touch list — and §7 hands it to you.
2. **The Apache-2.0 `LICENSE` files are not touched.** Their trailing
   `Copyright [yyyy] [name of copyright owner]` is the licence's own appendix, not a claim, and
   filling it in is editing the licence. This **corrects `docs/roadmap.md`'s Review line**, which
   reads *"Legal entity named in every LICENSE/NOTICE"*.
3. **The footer names the company, not the brand.** The mockup draws `© 2026 41Prompts`; this renders
   `© 2026 41Prompts Inc.`. One word, and it is the word the epic exists for — a `©` names a holder.

## 6a. This epic edits files on the "never touch" list, and is allowed to

`CLAUDE.md` lists **"Any `LICENSE`, `NOTICE`, or `REUSE.toml`"** among the things not to touch
*without an explicit instruction in the current epic*. This epic touched all three kinds: four
proprietary `LICENSE` bodies, six `NOTICE` files, `REUSE.toml`, and a new `mirror/REUSE.toml`.

**The instruction is the epic's own Tasks line** — `docs/roadmap.md`, EPIC-056: *"Apache-2.0 +
NOTICE + SPDX"* — and its Review line, *"Licence headers present everywhere. Legal entity named in
every LICENSE/NOTICE."* There is no way to satisfy either without editing them, and this is the one
epic in the roadmap whose subject they are. Recorded here rather than left for a reader to notice,
because "it seemed necessary" is exactly the reasoning that list exists to refuse.

Two other list entries were touched under their standing carve-outs: `docs/decisions/AUTONOMOUS.md`
(appended to, never edited — `docs/AUTONOMOUS.md` grants this explicitly) and EPIC-056's own status
cell in `docs/backlog.md` at step 8. **Nothing else in `docs/decisions/`, nothing in
`docs/roadmap.md`, no other backlog row, and nothing in `infra/` was changed.**

## 7. Open questions, all yours

| what | why it is yours |
|---|---|
| **`docs/decisions/ADR-002-licensing-and-repos.md` still says the holder is a placeholder "until incorporation" and that the assignment is "executed before EPIC-056".** Both conditions are now met. | `docs/decisions/*` is on `CLAUDE.md`'s never-touch list. An ADR that reads as current and is not is a trap for the next reader; a superseding note is one line. |
| **`docs/roadmap.md`'s EPIC-056 Review line** — "Legal entity named in every LICENSE/NOTICE" — cannot be met as literally written, per §6.2. | `docs/roadmap.md` is yours. |
| **Is `41Prompts Inc.` the exact registered form**, including the full stop? It is now in 433 places. | Only you can check the certificate. A wrong holder is worse than a placeholder. |
| **`privacy@41prompts.ai` must exist.** Now named by `SECURITY.md` as well as by both legal pages. | A Cloudflare routing rule, already on the handover. |
| **Is a public `ci.yml` wanted?** Not built — `docs/roadmap.md` names `dependency-review-action` and trusted publishing, and nothing else. Worth knowing: **Actions is free on public repositories**, so this one does not spend the allowance EPIC-009 was about. | Scope, and it is a new workflow in a repository strangers open pull requests against. |

## 8. What needs a person, and is not ticked

`docs/AUTONOMOUS.md`: a step that needs a person is skipped and said out loud, in its own numbered
section, with nothing ticked on anyone's behalf.

1. **Create `github.com/41prompts/41prompts` and push the filtered history.** `pnpm mirror-dry-run`
   rehearses the whole extraction and pushes nowhere; `CLAUDE.md`'s "Nothing is pushed" is absolute.
   The commands are the dry-run's own `git-filter-repo` invocation.
2. **Register `41p` on npm.** Available, unregistered as of 2026-09-18. `packages/cli-unscoped`
   cannot publish until it is. This is EPIC-057's row **057b**, and it is the finding that
   **expires** — a name taken first cannot be recovered.
3. **Register `fortyone-prompts` on PyPI.** Same. Note the awkward shape: **`41prompts` is registered
   and `fortyone-prompts` is not**, which is backwards for an alias that depends on it.
4. **Enable trusted publishing** in npm's and PyPI's web interfaces, naming this repository and the
   two workflow filenames. The code half is built; the registry half is an account.
5. **Publish.** Nothing has been published. No `npm publish`, no `uv publish`, not even a dry run
   against a real registry.
6. **The IP assignment document itself.** Reported done on 2026-09-18 and taken at your word; no copy
   is in this repository and none was asked for.
7. **The trademark filing.** `TRADEMARKS.md` states names in use and explicitly claims no
   registration. EPIC-071 is `deferred`.

## 9. New dependencies

**None.** No runtime dependency, no devDependency, no new tool. The only new third-party text is the
Developer Certificate of Origin 1.1, reproduced verbatim, attributed to The Linux Foundation in
`REUSE.toml` and accounted for by `LICENSES/LicenseRef-DCO-1.1.txt`. 41Prompts Inc. claims no
copyright in it.

## 10. Verify commands

```bash
# the substitution, and what was deliberately left
git grep -l "<legal entity>"                                              # allow-list only
git grep -n "soroushamdg/41prompts" -- . ':!infra' ':!.github' ':!docs'    # empty

# the tests that own the claims
pnpm --filter @41prompts/web exec vitest run legal-entity.test.ts public-distributions.test.ts

# the control for A9 — remove `--path packages/cli-unscoped` and its required-paths entry first
pnpm --filter @41prompts/web exec vitest run public-distributions.test.ts   # expect 2 failures

# the split, rehearsed end to end
pnpm mirror-dry-run

# the only CI there is
node scripts/gate-run.mjs

# the drive
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
npx turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3118)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/56.env
set -a && . /tmp/56.env && set +a
pnpm --filter @41prompts/web start --port 3118 &
npx tsx scripts/drive-epic-056.mts
```
