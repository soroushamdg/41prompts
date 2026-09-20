<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-072b: About and Careers, said honestly

Stage: 6 · Depends on: EPIC-072, EPIC-016b · Size: **S**

Sequence and rationale in `docs/epics/plan-mockup-parity.md`.

## Why this row

EPIC-072 built six marketing pages and refused five, each with a reason written before any code.
Two of those reasons were **facts only Soroush could assert**, and he has now asserted them:

| Page | EPIC-072's refusal | Soroush, 2026-09-20 |
|---|---|---|
| `/about` | *"names a second co-founder — your fact, not mine"* | Not a current co-founder. **Omit the name.** |
| `/careers` | *"three invented openings"* | Not real. **Closed.** |

The other three refusals stand: `/pricing` goes to EPIC-070, `/learn` to Stage 7, `/blog` to
EPIC-073.

## Goal

`/about` and `/careers` exist, are linked from the footer, and say only what is true — one founder,
and no open roles.

## Scope

1. **`/about`.** The mockup's structure: eyebrow, a headline, a paragraph of origin, and the people.
   The origin paragraph is the mockup's own and is true as written apart from its date — check the
   year against the repository's first commit rather than copying `2025`.

   **One person: Soroush Bonab, Founder.** No second card, no placeholder, and no sentence implying
   a team.

2. **`/careers`.** The page exists and says there are no open roles right now, with the contact
   route for someone who wants to be told when that changes. Not a 404, not three invented cards.

   *Assumption, flag it if wrong:* "close them" is read as *the openings are closed, the page
   stays*. A footer link to a 404 is what EPIC-016 refused for the site nav. If Soroush would
   rather the page not exist at all, drop the route and the footer link together — it is a
   ten-minute change either way.

3. **The footer gains both**, in the `Company` group the mockup draws.

4. **Both pages into the claims registry** where they make a factual statement, and into
   `public-routes.json`, `sitemap.xml` and the Lighthouse sweep — the three places EPIC-072 found
   a page can be built and still be invisible.

## Out of scope

- `/pricing`, `/learn`, `/blog`.
- A job-application form, an applicant mailbox, or an ATS.
- Photographs, bios beyond a line, or a company history longer than the mockup's paragraph.
- Changing `/security`'s SOC 2 absence. Still not true.

## Acceptance criteria

- [ ] `/about` contains no string matching `/\bco-founders?\b/i` or `/\bour team\b/i`, and
      `claims.test.ts` stays green with its controls intact. Evidence: the run.
- [ ] `/about` names exactly one person. Evidence: test name.
- [ ] `/careers` states plainly that there are no open roles and offers a contact route. Evidence:
      test name plus a screenshot.
- [ ] Both routes are in `public-routes.json` and in `sitemap.xml`, and the sitemap test that
      EPIC-072 added still fails when a page is missing from it. Evidence: the run.
- [ ] Both pages carry the skip link and the shared nav and footer. Evidence: the chrome test.
- [ ] Lighthouse ≥90 on both, accessibility 100. Evidence: `scripts/lighthouse-site.mjs`.
- [ ] Neither page scrolls sideways at 390px. Evidence: `overflow.ts`.
- [ ] `pnpm forbidden-words` passes; all gates green per package; `gates.mjs ci` green before merge.
- [ ] Both pages loaded in a browser from the built app, screenshots in the report.
- [ ] Report and session log written.

## Notes for the implementer

- The mockup's `/about` is at lines 864–878 and `/careers` at 966–980.
- `claims.test.ts`'s `["a team", /\bco-founders?\b|\bour team\b|\bwe are hiring\b/i]` is the guard
  and its control row is the mockup's *"Co-founder. Engineering."*. **Neither the pattern nor its
  control is removed by this epic** — the pattern is still protecting something true. "Founder"
  alone does not match it. Check that before writing the line, not after.
- `we are hiring` is also in that pattern, which is the right answer for `/careers` as scoped.
- EPIC-072's four found defects are the checklist for any new public page: the nav's width at
  390px, absence from `sitemap.xml`, a missing skip link, and the footer's fourth group wrapping.
  Only the last was visible in a screenshot; the other three passed every assertion.
