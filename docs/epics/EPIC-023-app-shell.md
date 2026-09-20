<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-023: App shell — the rail and the top bar

Stage: 2 · late entry, 2026-09-20 · Depends on: EPIC-021a, EPIC-042, EPIC-055 · Size: **M**

**Written by Claude Code in the advisor's chair**, 2026-09-20, under `docs/PROCESS.md`'s amendment
of 2026-09-15. Sequence and rationale in `docs/epics/plan-mockup-parity.md`.

## Why this row, and why it is first

`docs/design/41prompts-full-mockup.html` draws every signed-in screen inside a **216px left rail**
and a **sticky top bar**. Neither exists. The word "rail" appears nowhere in `docs/roadmap.md`,
`docs/backlog.md`, or any of the 44 epic files — **it was never in anyone's Scope.**

`apps/web/app/app/layout.tsx` is explicit about the intent and about the miss:

> The mockup puts identity and account in **persistent chrome** — a left rail whose foot shows who
> you are, with an "Account" group above it. […] A layout is the same shape at a fraction of the
> cost, and it is where the rail goes when Stage 3 builds it.

Stage 3 built runs, attribution, a judge and activation. It did not build the rail, because no
criterion asked for one. Stages 4 and 5a then added Versions, Providers, Deploy, Connect and
Settings — **five more destinations hung off a chrome designed to hold none of them.**

What that costs today, measured by driving the built app: from `/app/pr/<id>` you reach Runs and
Versions by two buttons in the page head, Deploy by a third, and **Connect not at all** — it lives
under the *project*, and nothing on a prompt page links to it. Settings is reachable only from a
word in the top strip. This is the `/app` dead end `PROCESS.md` already names, repeated at five
times the size.

It is first because **nothing depends on it and everything benefits**: EPIC-024 lays out pages
inside it, and it is the single change that most moves the platform toward the mockup per unit of
work.

## Goal

Every signed-in page renders inside the mockup's shell — a persistent left rail with grouped,
icon-led navigation and a sticky top bar with breadcrumbs, version state and the primary action —
so that every surface the product has built is reachable from every other one.

## Scope

1. **`AppRail`**, rendered by `apps/web/app/app/layout.tsx`, replacing `.app-chrome`.

   Three groups, exactly as the mockup lays them out, minus what does not exist:

   | Group | Items | Href |
   |---|---|---|
   | `WORKSPACE` | Projects | `/app/projects` |
   | | Import | the decompiler, on the apex host via `appOrigin()`'s sibling |
   | *(project name)* | Connect | `/app/p/<projectId>/connect` |
   | *(prompt name)* | Blok Editor | `/app/pr/<promptId>` |
   | | Runs | `/app/pr/<promptId>/runs` |
   | | Versions | `/app/pr/<promptId>/versions` |
   | | Deploy | `/app/pr/<promptId>/deploy` |
   | `ACCOUNT` | Settings | `/app/settings/providers` |
   | | Account | `/app/account` |

   **The middle groups are contextual.** The mockup heads them with the prompt's name
   (`REFUND CLASSIFIER`). They render only when a project or a prompt is in context, and the heading
   is that record's name. On `/app/projects` and `/app/settings/*` there is no middle group.

   **Lessons is not in the rail.** Stage 7 owns it; a rail item to a 404 is what EPIC-016 refused
   for the site nav and the reasoning is identical.

2. **The icons, copied verbatim** from the mockup's rail (lines 1046–1060): four squares for
   Projects, a down-arrow-into-tray for Import, three panes for Blok Editor, a check for Runs, a
   clock for Versions, an up-arrow-onto-a-line for Deploy, a link for Connect, a cog for Settings.
   `viewBox="0 0 24 24"`, `stroke:currentColor`, `fill:none`, `stroke-width:1.9`,
   `stroke-linecap:square`, 15×15. `aria-hidden` — the label beside it is the accessible name.

3. **The rail foot**: the mockup's `.railfoot` / `.who` / `.avat` — initials in a 26px bordered
   square, the signed-in email, and **Sign out**, which is where it moves from `.app-chrome`.

   **No plan and no quota.** The mockup's foot says `Pro · 4,120 runs left`. There are no plans
   until EPIC-070 and no run budget is enforced. Render the email and nothing else.

4. **`AppTopBar`**, sticky, `z-index` beneath the consent banner:
   - **Breadcrumbs** — `Refund classifier / **Blok Editor**`, the trail bold on the last segment,
     each earlier segment a link. On `/app/projects` it is `**Projects**` alone.
   - **The version pill**, when a prompt is in context: `Draft v7 · Live v6`, using
     `versionName()` and `liveName()`, which already exist and already say this.
   - **Theme** — the existing `ThemeToggle`.
   - **Website** — a link to the apex origin.
   - **The primary action**, when a prompt is in context: `Run suite` → the prompt's runs page.

5. **A mobile answer the mockup does not have.** Below 940px the mockup's `.app` grid collapses to
   one column, which stacks a nine-item rail above every page. Instead: the rail becomes a
   `<details>` disclosure in the top bar, labelled `Menu`, holding the same list in the same order.
   Server-rendered, no client JS — `ThemeToggle` stays the only client component in the shell.

6. **`packages/ui/src/app-shell.css`**, with the mockup's rail and top-bar rules ported onto the
   existing token set.

## Out of scope

- **Any page's body.** Projects stays a list, the editor stays as it is, nothing inside `<main>`
  moves. EPIC-024 owns all of it. This epic must be reviewable as *chrome only*.
- **Lessons**, in the rail or anywhere.
- **An in-app Import page.** The rail links to the decompiler that exists. EPIC-025 is written and
  unscheduled.
- **Team and Billing settings.** Neither exists.
- **Any new data.** The rail reads the names already loaded for breadcrumbs; it adds no query that a
  page does not already make.
- **Changing the public site's nav or footer.** EPIC-072 owns those.

## Acceptance criteria

- [ ] The rail renders on every route under `/app`, with the correct group present or absent for
      that route. Evidence: one Playwright spec asserting the group set on `/app/projects`,
      `/app/p/<id>/connect`, `/app/pr/<id>`, `/app/settings/providers`.
- [ ] The current item carries `aria-current="page"` and nothing else does. Evidence: test name.
- [ ] **Every rail item is an `<a>`, not a `<button>`.** The mockup uses buttons; a control that
      changes the URL is a link (EPIC-055's Settings ruling). Evidence: test asserting no
      `<button>` inside the rail's `<nav>` except the disclosure's summary.
- [ ] From a prompt page, Connect is reachable in one click. Evidence: the drive.
- [ ] The version pill reads `Draft vN` and, when published, `Draft vN · Live vM`, in **neutral
      ink**. No amber. Evidence: test name plus a screenshot.
- [ ] Breadcrumbs name the real records, and each earlier segment navigates. Evidence: test name.
- [ ] Sign out works from the rail foot on every `/app` route. Evidence: the drive.
- [ ] **No route under `/app` scrolls sideways at 390px**, and the disclosure opens and closes by
      keyboard. Evidence: the `overflow.ts` helper over every app route — the check EPIC-072 added
      after the site nav put itself 185px past a 390px viewport.
- [ ] Every rail item is a 44px touch target at 390px. Evidence: test name.
- [ ] The skip link lands past the rail, not before it. Evidence: test name.
- [ ] Light and dark both correct; `prefers-reduced-motion` shows end states. Evidence: two
      screenshots.
- [ ] `pnpm forbidden-words` passes. Evidence: command output.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm compliance`, `pnpm dead-code` green, each
      reporting **every package**. Evidence: the tables, not the word "clean".
- [ ] `node scripts/gates.mjs ci` green on the commit before merge, and its closing "what a green
      here still does not cover" block read and quoted.
- [ ] **The built app driven in a browser**, every `/app` route, screenshots in the report.
      `scripts/drive-epic-023.mts`, watched in the IDE pane, `DRIVE_HEADLESS=1` still working.
- [ ] Report and session log written.

## Verification

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance
npx turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3120)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/023.env
set -a && . /tmp/023.env && set +a
pnpm --filter @41prompts/web start --port 3120 &
npx tsx scripts/drive-epic-023.mts
node scripts/gates.mjs ci
```

Expected: every gate green with a per-package table; the drive reporting every `/app` route served
with the rail present, the correct item marked current, and zero sideways overflow at 390px.

## Notes for the implementer

- **The mockup is the spec for layout and tokens, not for copy.** `pnpm forbidden-words` fails on
  *block, assertion, drifted, Reconcile, enum, sha*. The rail's own labels are safe as drawn
  (`Blok Editor`, `Runs`, `Versions`, `Deploy`, `Connect`, `Settings`) — the trap is the top bar,
  where the mockup writes `v7 · unsaved` in amber. Build `Draft v7 · Live v6` in neutral ink:
  `docs/design/README.md` says both halves of that in as many words.
- The rail's CSS is at mockup lines 148–166 and the top bar at 168–173. Port them onto
  `packages/ui`'s tokens; do not copy the hex values. `--color-ink-3` is nudged from the mockup's
  for WCAG AA and the nudged value wins (`docs/design/README.md`).
- `aria-current="page"`, not the mockup's `aria-current="true"`. `true` is not a valid value for a
  link.
- The contextual group heading is a **record's name, typed by a user**. It renders as text and must
  not be trusted as markup anywhere.
- `appOrigin()` in `lib/site/url.ts` is how the app host names the apex; the site nav already uses
  it in the other direction and the comment there says why it is absolute.
- Do not add a query. Breadcrumbs need a project name and a prompt name; `canvasForOwner` already
  returns the prompt and its project id, and the project page already loads its own name. If a name
  is genuinely not in hand for a route, say so in the report rather than adding a fetch to the
  layout — a layout query runs on every navigation.
- **Ask how the drive would demonstrate this before writing the drive** (HANDOVER lesson 36). For
  this epic the demonstration is a single browser session that reaches all nine destinations without
  typing a URL. If the drive cannot do that, the rail is not done.
- If a criterion is impossible or contradicts `CLAUDE.md`, write
  `docs/epics/BLOCKER-EPIC-023.md` and stop. Do not reinterpret silently.
