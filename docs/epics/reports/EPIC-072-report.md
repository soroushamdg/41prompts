<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-072 — Marketing site final

Built 2026-09-18 by Claude Code, in the advisor's chair as well as the implementer's
(`docs/PROCESS.md`, amendment of 2026-09-15). Branch `epic/072-marketing-site-final`.

## 0. What this is, in one paragraph

Six new public pages plus the third-party notices, and — the part that took the time — a **claims
registry** that turns `docs/roadmap.md`'s Review line, *"every claim maps to a shipped epic"*, from
something a person re-audits on every copy edit into something `pnpm test` answers. Five of the
mockup's site pages are **not built**, each because its content is a fact this repository does not
hold, and §8 says which and why. The drive found one defect the suite could not; the suite found
three the unit tests could not; and two of my own instruments were wrong and their controls caught
them.

## 1. Acceptance criteria

| # | criterion | evidence |
|---|---|---|
| 1 | `/features`, `/delivery`, `/docs`, `/security`, `/changelog`, `/guides` render and are reachable | ✅ `apps/web/e2e/site-pages.spec.ts` walks all 17 public routes for 200 + one `<h1>`; drive checks 1–7 render each in the built app with a proven-loaded stylesheet |
| 2 | Every marketing sentence on them comes from `claims.ts` | ✅ `apps/web/app/site-claims.test.tsx` — 133 tests; "renders every claim in the registry somewhere" with a control |
| 3 | Every claim names an epic with a report | ✅ `apps/web/lib/site/claims.test.ts` — 152 tests, 60 claims, each checked against `docs/epics/reports/`, with controls on `EPIC-999`, `EPIC-070`, `EPIC-060` |
| 4 | `/legal/third-party-notices` derived from the SBOM's source, not typed | ✅ `scripts/third-party-notices.mjs`; `third-party-notices.test.ts` re-runs it with `--check` and fails on a stale file (1.6 s) |
| 5 | Every nav, footer and in-page link answers 200 | ✅ `site-pages.spec.ts`, with a control asserting `/pricing` and `/careers` are 404 so the walk means something; drive check 17: 14 footer links, all 200 |
| 6 | Reduced motion shows end states | ✅ `site-pages.spec.ts` `test.use({ reducedMotion: "reduce" })` over all 17 routes, asserting computed opacity > 0.99 and no transform |
| 7 | Lighthouse ≥ 90, all pages, all four categories | ✅ §5 — 17 routes, lowest single score **94** |
| 8 | Nothing claims SOC 2, a lesson, a plan, a person or a published package | ✅ `claims.test.ts`'s denylist and `site-claims.test.tsx`'s, both with the mockup's own sentences as controls; drive check 10 over the built app |
| 9 | The two `landing-*-linux.png` baselines regenerated | ✅ §6 — regenerated twice, with the `dev-ui` gallery as an equivalence control |
| 10 | The built app driven by hand and screenshotted | ✅ §4 — `scripts/drive-epic-072.mts`, **18/18**, screenshots in `docs/epics/reports/screenshots/EPIC-072/` |

## 2. The registry is the epic

`apps/web/lib/site/claims.ts` holds **60 sentences**, each with the epic that shipped it and a path
to the code. Three tests bind it:

- **`claims.test.ts`** — every `epic` has a report; every `evidence` path exists; no claim matches
  the denylist; ids unique; every claim ends as a sentence; `claim("nope")` throws rather than
  rendering an empty paragraph.
- **`site-claims.test.tsx`** — renders all seven pages and fails on a registry claim no page shows,
  on any social-proof pattern, and on any digit nobody explained.
- **`changelog.test.ts`** — walks `docs/epics/reports/` in **both** directions: every epic the
  changelog names has a report, and every report is either named or declared invisible with a
  reason. An epic that ships user-visible work and is not mentioned fails the build.

**The denylist was read off the mockup rather than imagined.** `41prompts-full-mockup.html`
asserts, as copy: SOC 2 Type I underway; nine lessons; a shared blok library; SSO/SAML; roles and an
audit trail; retention controllable per project; `npx 41prompts run` executing a suite in CI; six
blog posts; three open jobs; a second co-founder; a changelog whose newest entry is `v0.9` on 19
August 2026. The newest tag in this repository is `v0.5.0`.

**Every absence assertion carries a positive control built from the mockup's own sentence**, and one
earned itself within a minute of being written: the per-project-retention pattern required the word
*retention*, and the mockup's sentence is *"Run payloads can be kept, redacted or dropped per
project."* The pattern could never have fired. That is `docs/PROCESS.md` lesson 8, caught by the
mechanism lesson 8 exists to demand.

## 3. What each page says, and where its facts come from

| page | notable correction to the mockup |
|---|---|
| `/features` | "Manual override" and "Assertions" are words ADR-003 replaced; "Defragment" is not a feature. Twenty-one items, all from the registry. |
| `/delivery` | Its publish card advertised *"2 SDK versions in the field"* — a count of applications resolving, which needs a CDN this project does not have (EPIC-051 §4.1, EPIC-055 ruling 2). Replaced by EPIC-051's four real gate rows: checks and contract stop a publish, cost and diff report. |
| `/docs` | The mockup runs `npx 41prompts run` and prints a pass rate. **`41p run` calls no model** (EPIC-053 §8) and `41prompts` is not a package name. The CI command is `41p check`. `docs-commands.test.tsx` pins the page to the CLI's own `COMMANDS` table and asserts the two wrong lines never appear. |
| `/security` | "SOC 2 in progress. Type I underway" is removed outright — nobody has started one, and it is the sentence a buyer's security review reads first. "Retention per project" is removed: the three numbers are global and are imported from the constants the purge jobs read. What replaces both is what exists — two published threat models. |
| `/changelog` | Four invented releases replaced by stages, derived from the reports on disk. |
| `/guides` | Six cards, five of them titles with no article behind them. One guide exists; the page says so. |
| `/legal/third-party-notices` | New. 423 production dependencies under 16 licences, generated. |

## 4. The drive — 18/18, and the one thing it caught

`scripts/drive-epic-072.mts`, against `next start` on the built app, screenshots in
`docs/epics/reports/screenshots/EPIC-072/`, transcript in that directory.

**It asked one question the e2e suite structurally cannot: can a phone reader reach these pages at
all?** The nav's section links collapse below 900px. That was the right fix for §6's overflow and it
is also the exact shape of the `/app` dead end EPIC-021a shipped — a page that renders perfectly and
that nobody can leave. So the drive **clicks** through the footer at 390px rather than asserting an
href exists, and reaches Features, Delivery and Docs.

**The one failure on its first run was my own assertion, not the page.** The claim-pattern check
matched `SSO` on `/legal/third-party-notices` — against `@aws-sdk/credential-provider-sso@3.973.15`,
a real transitive dependency, read as a claim that this product does single sign-on. That is
`docs/PROCESS.md` lesson 21. Fixed by scoping the patterns to the page's **prose**: the generated
package list comes out, the page's own lede and closing paragraph stay in, and a control asserts both
halves of that. The same patterns were added to `site-claims.test.tsx`, which had been checking the
pages more loosely than the registry they are built from — that gap is why the drive found it first.

**The footer was visibly wrong and every assertion passed.** `.site-foot-grid` was
`2fr 1fr 1fr 1fr`; a fourth group wrapped underneath the logo. Every link was present, answered 200
and was clickable. Only the screenshot showed it. Sized off the group count now.

**A stale count, invisible to the number guard.** `/features` opened with *"Twelve things this does
today"* and grew to twenty-one in the same session. `site-claims.test.tsx` requires every **digit**
on a page to be explained and a spelled-out count walks straight past that. The lede no longer
carries a number that has to be maintained alongside the thing it counts.

## 5. Lighthouse

`node scripts/lighthouse-site.mjs http://127.0.0.1:3111`, against the built app, 17 routes.

| route | performance | accessibility | best practices | SEO |
|---|---|---|---|---|
| `/` | 98 | 100 | 100 | 100 |
| `/features` | 94 | 100 | 100 | 100 |
| `/delivery` | 99 | 100 | 100 | 100 |
| `/docs` | 99 | 100 | 100 | 100 |
| `/security` | 99 | 100 | 100 | 100 |
| `/changelog` | 95 | 100 | 100 | 100 |
| `/guides` | 99 | 100 | 100 | 100 |
| `/guides/what-your-prompt-does-not-check` | 95 | 100 | 100 | 100 |
| `/decompile` | 94 | 100 | 100 | 100 |
| `/legal/terms` | 95 | 100 | 100 | 100 |
| `/legal/privacy` | 99 | 100 | 100 | 100 |
| `/legal/security` | 99 | 100 | 100 | 100 |
| `/legal/sub-processors` | 95 | 100 | 100 | 100 |
| `/legal/third-party-notices` | 98 | 100 | 100 | 100 |
| `/contact` | 99 | 100 | 100 | 100 † |
| `/sign-in` | 95 | 100 | 100 | 100 † |
| `/sign-up` | 99 | 100 | 100 | 100 † |

**† and it is the interesting part.** Those three score **63 to 66** on SEO as Lighthouse ships,
for one audit: `is-crawlable`, weight 4 of SEO's 11. They have been disallowed in `robots.txt` since
EPIC-015 because none is a destination for a search result. The criterion cannot be met on them
without indexing pages we deliberately do not index, so the runner drops that **one** audit for
**those** routes and recomputes SEO from the rest — every other SEO audit still applies.

**The instrument is checked in both directions**, which is the half that matters: a route named as
not-indexed that turns out to be crawlable fails, and a route **not** named that turns out to be
blocked fails. The second is the one that earns its keep — a page silently dropping out of search is
precisely what a one-way waiver would hide.

`lighthouse` is a new devDependency (§7). The runner drives **Playwright's Chromium** rather than
`chrome-launcher`, so there is no second dependency and the numbers are about the browser the e2e
suite already pins.

## 6. Three defects the suite found, and one it found in another epic's page

**1. The nav made every public page scroll sideways at 390px.** Four inline links put the nav 185px
past the viewport. Because the nav is on every page, that broke `/` and `/legal/privacy` too — pages
this epic never touched — and produced **17 e2e failures across three spec files, two of them
EPIC-016's and EPIC-017's.** One defect, seventeen symptoms.

The mockup had already answered it: `.navlinks { display: none }` with
`@media (min-width: 900px) { display: flex }`. Features, Delivery and Docs collapse below 900px;
Decompiler stays, because `landing.spec.ts` asserts a 44px Decompiler link at 390px and it is the
page a phone reader most wants. Wrapping to a second row was the alternative and is BUG-069.
**Measured after: 0px overflow on all nine routes probed** — and probed, not reasoned about, which
is what turned "several pages are broken" into one line of CSS in about two minutes.

**2. Six live pages were absent from `sitemap.xml`.** It listed its routes by hand. The pages were
live and linked from the nav and invisible to a crawler that starts from the sitemap — for search
purposes, not shipped. `apps/web/lib/site/public-routes.json` is now the one source, read by
`links.ts`, `sitemap.ts`, the Lighthouse runner and `routes-agree.test.ts`, which checks all four
against each other in both directions with a control named after this defect.

**3. The skip link was rendered by whichever page remembered it.** `/` and the one guide had one;
`/decompile`, `/contact` and all four legal pages did not, so a keyboard reader tabbing into any of
those walked the whole nav first. Nothing asserted it because the assertion lived on the home page's
own test. It is in `SiteNav` now. `/sign-in` and `/sign-up` render no nav and still correctly have
none.

**And two of my own instruments were wrong.** `site-claims.test.tsx` blanked `&[a-z]+;` and left
React's numeric entities alone, so every apostrophe became `&#x27;` — claims never matched the
registry *and* the number guard reported an unexplained `27` on four pages, two failures from one
missing decode, both looking like defects in the pages. And a new robots control read `Disallow: /`
as a substring of `Disallow: /d/`, reporting a defect in `robots.ts`, which was correct throughout.

## 7. Dependencies

Two, both with their reason in the commit message.

- **`lighthouse` ^13.5.0**, devDependency of `apps/web`, **Apache-2.0**. `docs/roadmap.md`'s Tests
  line names it and nothing in this repository measured performance, best practices or SEO on a
  rendered page. `license-gate` clean: 0 public-package dependencies, 17 private-only warnings,
  unchanged in kind.
- **`@41prompts/cli`**, workspace devDependency of `apps/web`. `docs-commands.test.tsx` pins the Docs
  page to the CLI's own `COMMANDS` table. No third-party code.

It is **not** in `scripts/gates.mjs`: Lighthouse needs a server and a browser and a full pass takes
minutes, which is `docs/PROCESS.md`'s measured argument about the e2e container — a gate nobody runs
because it is slow covers nothing.

## 8. Not built, and why — the five mockup pages

Stated in the epic file before any code, not discovered here.

| page | why not | whose it is |
|---|---|---|
| `/pricing` | Needs **EPIC-070** (`todo`). $29/$79 are `docs/roadmap.md`'s own numbers, marked *unvalidated* since EPIC-005 was cut. There is no checkout, no plan and no metering, so "50 runs a month" is a limit nothing enforces. A price with no way to pay it is the clearest violation of this epic's Review line there is. | EPIC-070 |
| `/learn` | Nine lessons are Stage 7, EPIC-060 to EPIC-063, none started. | Stage 7 |
| `/blog` | The mockup's six posts are fabricated down to their dates and read times. Content from real run data is **EPIC-073**'s Tasks line. The one real article is indexed by `/guides`. | EPIC-073 |
| `/about` | Names a **second co-founder** and a founding year. Facts only Soroush has; inventing a person's role on a live page is not a copy decision. | **Soroush** |
| `/careers` | Three open positions. Only Soroush knows whether he is hiring. | **Soroush** |

**Also not built: "run demo, rotator, counters from real data"**, from the same Tasks line. There is
no real data. No CDN and no artifact bucket, so applications-resolving cannot be counted (EPIC-051
§4.1, EPIC-055 ruling 2); nothing is published to npm or PyPI, so installs are zero; production
serves `v0.5.0`; and the total number of real provider calls this product has ever made is **two**
(EPIC-031a). EPIC-055 already ruled that an empty table is a *claim* rather than a neutral absence,
and a counter reading zero is the same shape. A live run demo on an unauthenticated public page is
additionally an abuse surface: EPIC-014 rate-limits and Turnstile-gates the decompiler, which costs
nothing per call, and a model call does.

## 9. What the local drive does not cover

The image build, the Coolify environment, Traefik, and migrations against the real database. **Nothing
is pushed** (`CLAUDE.md`, 2026-09-15), so nothing deploys and **no staging URL is evidence about any
of this** — `origin/main` is well behind and staging serves a much older commit.

`gates.mjs ci`'s own closing block adds two more, quoted rather than paraphrased:

> · The runner is Linux and this is darwin: the four visual-regression baselines are `-linux.png`
> and their specs skip here.
> · The runner is slower than this machine.

**The first of those is closed for this change and the second is not.** The two landing baselines
were regenerated inside `mcr.microsoft.com/playwright:v1.63.0-noble` and the two `dev-ui` baselines
were run in the same container **without** `--update-snapshots` and passed unchanged — which proves
both that the container is equivalent to the one CI uses and that the CSS this epic appends does not
touch the design-system gallery. Nothing here addresses the runner being slower.

## 10. Verify

```
pnpm test && pnpm typecheck && pnpm lint          # 9/9, 9/9, 12/12
node scripts/gates.mjs ci                          # 16/16
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
pnpm e2e                                           # 319 passed, 4 skipped on darwin

pnpm exec turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3118)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/72.env
set -a && . /tmp/72.env && set +a
pnpm --filter @41prompts/web start --port 3118 &
npx tsx scripts/drive-epic-072.mts                 # 18/18
node scripts/lighthouse-site.mjs http://localhost:3118
node scripts/third-party-notices.mjs --check
```

## 11. Open questions, all Soroush's

1. **`/about` and `/careers`.** Both need facts only you have — whether there is a second founder and
   what their role is, and whether you are hiring. Neither is a copy decision. The mockup's `/about`
   names *Rambod Azimi, Co-founder, Engineering* and a founding year of 2025; I have not put any of
   that on a page.
2. **`/pricing`.** The roadmap's $29/$79 are marked unvalidated and EPIC-005, which would have
   validated them, is cut. EPIC-070 is where the page belongs; it needs a Stripe account.
3. **The `▣ GATE 3` and `▣ GATE 5` status cells in `docs/backlog.md` still read `—`** while both
   gates are decided in `docs/decisions/`. `scripts/pick-next-epic.mjs` reads the cell and stops on
   GATE 3 on every pass. One word in each. `docs/backlog.md` is your file.
4. **A release is overdue.** `docs/epics/RELEASE-DUE.md` records 191 commits and twelve merged epics
   against the three `docs/AUTONOMOUS.md` allows, with production at `v0.5.0`. Nothing here is tagged
   or pushed.
5. **This row's Size cell says M and that is right**, unlike EPIC-056's. No change needed.
