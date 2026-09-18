<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-072: Marketing site final — the pages that exist, and a gate that says every claim on them is true

Stage: 6 · Depends on: EPIC-016, EPIC-055 · Size: **M**

**Written by Claude Code in the advisor's chair**, 2026-09-18, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 to EPIC-057 set. The Tasks, Tests and
Review lines below are `docs/roadmap.md`'s, unchanged; the Goal, the Scope and the Out of scope are
this file's reading of them.

`docs/roadmap.md`, Stage 6:

> **Tasks.** Every page from the mockup; run demo, rotator, counters from real data; Ask-AI chips;
> `/legal/third-party-notices`; reduced-motion end states everywhere.
> **Tests.** Lighthouse ≥ 90 all pages; links resolve; reduced motion verified.
> **Review.** Every claim maps to a shipped epic.

## Goal

The site has the pages the nav promises, and **no sentence on any of them describes something that
is not built** — enforced by a test rather than by care.

## Why the Review line is the epic, and not a closing check

`41prompts-full-mockup.html` was drawn in 2025 for a product that did not exist. Read as a
specification of *copy*, it asserts, among other things: SOC 2 Type I underway; nine lessons; a
shared blok library; SSO/SAML; roles and an audit log; per-project retention control; `npx
41prompts run` executing a suite in CI; six blog posts; three open jobs; a second co-founder; a
changelog whose newest entry is `v0.9` on 19 August 2026.

**None of those is true.** The newest tag is `v0.5.0`, `41p run` deliberately does not call a model
(EPIC-053 §8), there is no metering, no Stripe, no lesson engine, and nothing is published to npm or
PyPI. `docs/design/README.md` already says the prototypes are the spec **for the interface**, and
that where one implies something about what gets sent, stored or published it is an illustration to
be decided on its own terms. This epic extends that reading one step: **a prototype is not a source
of facts about the company.**

So the deliverable is not eleven pages. It is six pages plus **`apps/web/lib/site/claims.ts`** — the
claims the site makes, as data, each naming the epic that shipped it — and the tests that fail when a
page renders a claim the registry does not hold, or the registry names an epic with no report in
`docs/epics/reports/`. That converts the Review line from something a reader has to re-audit on every
copy change into something `pnpm test` answers.

## Scope

1. **`apps/web/lib/site/claims.ts`** — every marketing claim on the site as a typed record: an id, the
   sentence, the epic that shipped it, and where in the repository the evidence is. Plus
   `claims.test.ts`, which fails when a claim names an epic that has no report file, and
   `site-claims.test.ts`, which renders each new page and fails on a claim sentence that is not in
   the registry.
2. **Six new public pages**, each assembled from registry claims and nothing else:
   `/features`, `/delivery`, `/docs`, `/security`, `/changelog`, `/guides`.
3. **`/legal/third-party-notices`**, generated from the SBOM `scripts/license-gate.mjs --sbom`
   already produces, not hand-written.
4. **The nav and the footer** gain the pages that now exist. `apps/web/app/site-chrome.tsx`'s comment
   naming EPIC-072 as the epic that fills the nav is discharged here.
5. **Ask-AI chips** on the new pages, through the existing `lib/landing/handoff.ts`.
6. **Reduced motion**: every new page shows end states under `prefers-reduced-motion`, never a skip.
7. **Lighthouse ≥ 90** on every public page, measured and recorded with the numbers.
8. **Every link resolves** — nav, footer and in-page — asserted over the rendered pages.

## Out of scope

Five of the mockup's site pages are **not built**, each because its content is a fact this repository
does not hold. This is a narrowing of the Tasks line's "every page from the mockup" and it is stated
here rather than discovered in the report.

| page | why not |
|---|---|
| `/pricing` | Needs **EPIC-070** (`todo`). $29/$79 are `docs/roadmap.md`'s own numbers marked *unvalidated* since EPIC-005 was cut; there is no checkout, no plan and no metering, so "50 runs a month" is a limit nothing enforces. A price with no way to pay it is the clearest possible violation of the Review line. |
| `/learn` | Nine lessons are **Stage 7** (EPIC-060 to EPIC-063), none started. |
| `/blog` | The mockup's six posts are fabricated, down to their dates and read times. Writing real ones from real run data is **EPIC-073**'s Tasks line. The one real article, `/guides/what-your-prompt-does-not-check`, is indexed by `/guides` here. |
| `/about` | Names a second co-founder and a founding year. Facts only Soroush has; inventing a person's role on a live page is not a copy decision. |
| `/careers` | Three open positions. Only Soroush knows whether he is hiring. |

Also out of scope, from the same Tasks line:

- **"run demo, rotator, counters from real data".** There is no real data. No CDN and no artifact
  bucket, so "apps resolving" cannot be counted (EPIC-051 §4.1, EPIC-055 ruling 2); nothing is
  published to npm or PyPI, so installs are zero; production serves `v0.5.0`; and the total number of
  real provider calls this product has ever made is **two** (EPIC-031a). EPIC-055 already ruled that
  an empty table is a *claim* rather than a neutral absence, and a counter reading zero is the same
  shape. A live run demo on an unauthenticated public page is additionally an abuse surface — EPIC-014
  rate-limits and Turnstile-gates the decompiler, which costs nothing per call, and a model call does.
- **Changing the home page beyond its nav and footer.** EPIC-016 owns it.

## Acceptance criteria

- [ ] `/features`, `/delivery`, `/docs`, `/security`, `/changelog`, `/guides` each render and are
      reachable from the nav or the footer. Verified: `apps/web/e2e/site-pages.spec.ts` loads each and
      asserts a 200 and an `<h1>`.
- [ ] Every sentence of marketing copy on those six pages comes from `claims.ts`. Verified:
      `apps/web/lib/site/site-claims.test.ts`, with a positive control that fails when a claim is
      removed from the registry.
- [ ] Every claim in the registry names an epic with a report in `docs/epics/reports/`. Verified:
      `apps/web/lib/site/claims.test.ts`, with a positive control on a fabricated epic id.
- [ ] `/legal/third-party-notices` lists every third-party dependency with its licence, derived from
      the SBOM rather than typed. Verified: a test that regenerates and compares.
- [ ] Every nav, footer and in-page link answers 200. Verified: `site-pages.spec.ts` walks the
      rendered chrome of every public page.
- [ ] `prefers-reduced-motion: reduce` shows end states on every new page and skips nothing. Verified:
      `site-pages.spec.ts` under `reducedMotion: "reduce"`.
- [ ] Lighthouse ≥ 90 for performance, accessibility, best practices and SEO on every public page.
      Verified: the numbers, per page, in the report.
- [ ] Nothing in the six pages claims SOC 2, a lesson, a plan, a person or a published package.
      Verified: `claims.test.ts`'s denylist, with a positive control.
- [ ] The two `landing-*-linux.png` baselines are regenerated on Linux for the moved chrome.
- [ ] The built app is driven by hand and screenshotted into
      `docs/epics/reports/screenshots/EPIC-072/`.

## Verification

```
pnpm test && pnpm typecheck && pnpm lint
node scripts/gates.mjs ci
turbo run build --filter=@41prompts/web && (cd apps/web && npx next start -p 3111)
tsx scripts/drive-epic-072.mts
```

## Notes for the implementer

- **The mockup is the layout, not the copy.** Take `.strip`, `.lesgrid`, `.price`, `.setrow`, the
  eyebrow/h1/lede rhythm and the token usage verbatim. Re-derive every sentence from the repository.
- **`docs/design/README.md`'s corrections bind**: no "block", "assertion", "override", "drifted";
  amber is drift only; green/red/amber mean pass/fail/drift and nothing else.
- **`apps/web/app/page.test.tsx` already guards the home page against customer counts and against
  numbers that are not facts about the product.** EPIC-056 §4.7 records both firing. The new pages
  need the same guard, and the number-listing test is designed to be answered by listing the number
  with its reason.
- **The changelog is derived, not typed.** Real tags and real merged epics only.
- **Adding `lighthouse` is a new dependency** and needs its one-line reason in the commit message and
  the report.
