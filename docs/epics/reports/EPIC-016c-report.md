<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016c — The rotator, as the mockup draws it

Built 2026-09-21. Branch `epic/016c-rotator-parity`. Epic file
`docs/epics/EPIC-016c-rotator-parity.md`; plan `docs/epics/plan-EPIC-016c.md`.

## 1. What is on the page that was not

The home page's capability rotator is now the mockup's rotator.

1. **Five illustrations.** Each panel carries a picture of the product at that step of the loop, and
   **none of them is drawn** — every one is assembled from `@41prompts/ui`'s own components, the
   same `BlokCard`, `Badge`, `Meter` and deploy-gate rows the product ships. A drawing goes stale
   silently the first time a component changes shape; an illustration made of the component cannot.
2. **Choosing a tab restarts the cycle** instead of ending it. Hover and focus still pause it.
3. **The timer runs only while the rotator is on screen**, gated on an `IntersectionObserver` at the
   mockup's threshold of `0.2`.
4. **The mockup's headings are back**, verbatim where ADR-003 allows them.
5. **The Test panel's second claim is `every-run-recorded`**, which is what the mockup's own
   paragraph for that panel says, rather than `judge-pinned`, which was about something else.

And one thing that is not on the page: **`data-example="true"`**, which nothing read. EPIC-016b's
report §8 item 2 asked for it to go the next time somebody was in that file.

## 2. The ruling, and what it uncovered

**Soroush, 2026-09-21: narrow the guard.** Two of the five panels paint `--pass` and `--fail`, and
`landing.spec.ts` had forbidden all three reserved hues anywhere on `/` since EPIC-016. The guard is
now *no reserved colour **outside** a marked example*, with its positive control in the same commit.

**Writing that control found that the guard had never worked.** It compared

```js
getPropertyValue("--color-pass").trim()   // "#0b5c2e"  — the DECLARED text
getComputedStyle(el).color                // "rgb(11, 92, 46)" — the COMPUTED value
```

Those are never equal, so the offender list could not be appended to and the test asserted
`[] === []`. **The same probe existed in four specs** — `landing`, `soft-ship`, `decompile`,
`capture-share` — all four with the same defect, all four green since EPIC-016, and all four quoted
in epic reports as evidence that those routes obeyed rule 10.

`CLAUDE.md` already has the rule that catches this: *every absence assertion needs a positive
control*. Four were written without one.

**What was done about it.** One module, `apps/web/e2e/reserved-colour.ts`, called by all four specs,
with `apps/web/e2e/reserved-colour.spec.ts` holding six controls — that it reports a reserved text
colour, reports a reserved background, reports nothing on the page as it ships, that the exemption
changes the answer, that the exemption does not leak to an element merely *beside* a marked example,
and that a probe which cannot read the tokens says so rather than reporting clean.

**The pages themselves were clean.** The corrected probe reports **zero** offenders on all four
routes. The bug was in the instrument, not in the product — but nobody knew that until it was run.

## 3. Reversible decisions, named

1. **The Test panel repeats a sentence the page already prints.** `every-run-recorded` is also a
   bullet in the provider-comparison section about a thousand pixels further down. The epic file
   specifies it and the epic file is the spec; it is also defensible, because the rotator is a
   summary of the loop and a summary restates. If the page should never repeat a registry sentence,
   that is a rule about the whole page and one line here.
2. **Deliver's illustration is invented**, because the mockup's fifth panel is about lessons that do
   not exist. It is `@41prompts/sdk`'s real call, copied from its README.
3. **`min-height: 410px` applies at ≥940px and to nothing below it.** §5 has the measurements and
   the reason.

## 4. Acceptance criteria

| # | Criterion | Evidence |
|---|---|---|
| 1 | Clicking or arrow-keying a tab selects it **and the cycle continues** once pointer and focus leave | ✅ `landing.spec.ts` › "advances on its own, and keeps advancing after the reader picks a tab". Drive: *Publish → Deliver, with nothing touched after the blur*. |
| 2 | Hover and focus pause it, and it resumes on leave | ✅ `landing.spec.ts` › "pauses while the pointer is on it, and resumes when it leaves". Drive: *six and a half seconds later, still Publish, because focus has not left the tab*. |
| 3 | The timer does not run off screen; a reader who has not scrolled to it finds it on *Import* | ✅ two tests — "does not advance while it is off screen" (which first proves the timer is alive, so "it did not move" cannot be a dead rotator) and "a reader who has not scrolled to it yet finds it on Import". Drive rows 5 and 6. |
| 4 | Each of the five panels renders an illustration, marked `Example`, with a caption naming what it is a picture of | ✅ `page.test.tsx` › nine surfaces; `landing.spec.ts` › one test per panel; `screenshots/EPIC-016c/01-panel-1..5-*.png`. |
| 5 | Every figure inside a panel is inside its marker; the numbers rule passes with its mutation control still firing | ✅ `page.test.tsx` › "shows only numbers that are facts about the product" and "would fail if one surface lost its Example marker". |
| 6 | The four ported headings match the mockup verbatim | ✅ `page.test.tsx` › "heads a panel with …" ×5, plus "no longer carries the heading EPIC-016b wrote over the model badges". |
| 7 | No panel says "assertion", "lessons", or names a decompiler classifier as a blok kind | ✅ `pnpm forbidden-words` clean across six roots; `page.test.tsx` › "says check where the mockup says the other word" and "builds the cards out of the six real blok kinds"; the `NOT_TRUE_YET` denylist runs over the rendered page with its controls. |
| 8 | Under `prefers-reduced-motion` a panel's illustration renders complete and in place | ✅ `landing.spec.ts` › "every panel's illustration is finished and in place, with nothing animating" — asserts count, zero animations, `transform: none`, opacity 1, per panel. Screenshots `07-reduced-motion-1..5-*.png`. |
| 9 | Reserved colour: the guard narrowed with its positive control, or ink — the decision and its control in the report | ✅ §2. Narrowed, one shared probe, six controls in `reserved-colour.spec.ts`. |
| 10 | `/` does not scroll sideways at 390px and no panel grows a horizontal scrollbar | ✅ `landing.spec.ts` › "does not scroll sideways at 390px" now also walks all five panels. Drive: *overflow 0px*, *five panels, none of them wider than the card*. |
| 11 | Lighthouse `/` unchanged within the instrument's own spread; accessibility 100 | ✅ §6. |
| 12 | Axe clean in both themes | ✅ `landing.spec.ts` axe light and dark, in the run of 2026-09-21. |
| 13 | The two `/` Linux visual baselines regenerated | ✅ §7. |
| 14 | All gates green per package; `node scripts/gates.mjs ci` green before merge | ✅ §8. |
| 15 | The built page driven by hand, both themes, 1440px and 390px | ✅ §9, 18/18. |
| 16 | Report and session log written | ✅ this file and `docs/epics/sessions/EPIC-016c-session.md`. |

## 5. The panel height, measured

`.rot .tab-panel`'s `min-height` was **240px**, set in EPIC-016b against panels that were a heading
and two paragraphs. Every new panel is taller than that, so the floor was clamping nothing and the
page jumped as the rotator advanced — which is the one thing that number exists to prevent.

Measured on the built app, `next start`:

| Panel | at 1440px | at 390px |
|---|---|---|
| Import | 402px | 448px |
| Compose | 395px | 511px |
| Test | 302px | 384px |
| Publish | 400px | 537px |
| Deliver | 347px | 499px |

**410px at ≥940px**, which is the tallest plus the card's padding: after the change all five panels
measure exactly 410px and the page does not move at all. **No floor below 940px**, for two reasons —
a 541px floor would leave a third of the card empty at 900px where the same content is short, and in
the narrow layout the tab strip sits *above* the panel, so a height change moves only what is below
a reader who is looking at the panel.

## 6. Lighthouse, and the spread stated rather than a delta claimed

EPIC-016b's report §8 item 3 said this instrument's spread on this machine is wider than the changes
being measured. **That is now a number.** Five consecutive runs of `/` against the same build:

```
93, 94, 99, 99, 99   →  spread 6 points, median 99
accessibility 100 on all five
```

So the single pass over all seventeen routes reported `/` at **92 performance, 100 accessibility**,
and that 92 is inside the instrument's own noise — the median on the identical build is 99, which is
where EPIC-016b left it. **This report claims no performance delta**, in either direction, because
the instrument cannot see one of this size. Every other route is unchanged and every category on
every route is at or above 90.

Five illustrations are more DOM, not more JavaScript; the `IntersectionObserver` is a few lines
inside a component that already hydrated.

## 7. Visual baselines

Regenerated in `mcr.microsoft.com/playwright:v1.63.0-noble` — they had to move, because the panel
gains content in every state, and the run confirmed it before regenerating: both compared **failed**
first, then were written, then compared clean.

```
landing page, light theme   re-generated
landing page, dark theme    re-generated

then, in compare mode, all four:
  ✓ design system gallery (/dev/ui) › visual regression: light theme
  ✓ design system gallery (/dev/ui) › visual regression: dark theme
  ✓ the landing page › landing page, light theme
  ✓ the landing page › landing page, dark theme
  4 passed (18.9s)
```

**The two `/dev/ui` baselines did not move**, measured rather than assumed — this epic edits
`landing.css` and `/dev/ui` renders the same `Tabs`, so it was worth running.

The container traps, again, so the next person does not rediscover them: `COPYFILE_DISABLE=1` on the
`tar`, `find /repo -name "._*" -delete` inside, the throwaway Postgres reached by its **bridge IP**
(`172.17.0.3` this time — `host.docker.internal` resolves to IPv6 in that image), and Docker
Desktop's file sharing refuses a bind mount from the session scratchpad, so `docker cp` rather than
`-v`.

## 8. Gates

```
pnpm test        9 of 9 packages
pnpm typecheck   9 of 9 packages
pnpm lint        12 of 12 (eslint ×9, dependency-cruiser, turbo boundaries, forbidden words)
pnpm compliance  reuse · boundaries · turbo boundaries · forbidden words · binary files ·
                 dead code (930 exports, none orphaned) · licences · mirror dry run (289 pytest)
pnpm e2e         full suite green before the last round of copy changes; the four touched specs
                 re-run after them — 88 passed, 2 skipped (the Linux baselines, run in the container)
node scripts/gates.mjs ci   — see §8.1
```

### 8.1 `node scripts/gates.mjs ci`

**Green on `9bdbfe3`, the commit that carries this report. 17 steps, all passed, 13m37s.**

```
  checkout      git clone + checkout 9bdbfe3b       PASS   0m01s
  ci.yml        pnpm install --frozen-lockfile      PASS   0m08s
                pnpm lint                           PASS   0m26s
                pnpm typecheck                      PASS   1m04s
                pnpm db:migrate                     PASS   0m02s
                pnpm test                           PASS   1m06s
                playwright install chromium         PASS   0m01s
                pnpm e2e                            PASS   8m55s   4 test(s) skipped on darwin
                uv run pytest -q (sdks/python)      PASS   0m27s
  compliance    reuse lint                          PASS   0m03s
                pnpm boundaries                     PASS   0m05s
                turbo boundaries                    PASS   0m01s
                pnpm forbidden-words                PASS   0m01s
                pnpm binary-files                   PASS   0m01s
                pnpm dead-code                      PASS   0m01s
                license-gate --sbom                 PASS   0m02s
                pnpm mirror-dry-run                 PASS   1m12s
```

### 8.2 What that green does not cover — the run's own closing block, answered

The mode prints two caveats every time, and `docs/PROCESS.md` says they are part of the result
rather than a footer. Both are read rather than repeated:

1. **"The runner is Linux and this is darwin: the four visual-regression baselines skip here."**
   For this epic that gap is **closed by §7**: the two `/` baselines were regenerated inside
   `mcr.microsoft.com/playwright:v1.63.0-noble` and all four then compared clean on Linux, in the
   same session and against this code. That is the one caveat this epic was most exposed to — it
   moves a panel's content in every state — and it is the reason the container run was not skipped.
2. **"The runner is slower than this machine."** Not closed, and not closeable locally. This epic
   adds timing-sensitive e2e tests: the rotator's cycle is five seconds and several assertions wait
   out more than one. They are written to wait on a **condition** (`expect.poll` against
   `aria-selected`, with 9s budgets against a 5s cycle) rather than on a duration, which is the
   mitigation `docs/PROCESS.md` names for CI #209 — but a 2-core runner under load is still the one
   thing this machine cannot reproduce.

And the standing one, which `CLAUDE.md` states rather than the gate: **nothing is pushed**, so no
second machine builds this, no image is built, and Coolify, Traefik and a real database are
untested. They wait for Soroush's next push.

## 9. The drive

`scripts/drive-epic-016c.mts`, against the **built** app (`turbo run build`, then `next start` on
:3131), watched — IDE preview pane plus a visible browser, `DRIVE_HEADLESS=1` still honoured.
**18/18.** Transcript at `docs/epics/reports/screenshots/EPIC-016c/transcript.txt`.

What it caught that the tests did not:

1. **The Deliver panel illustrated an API that does not exist.** The first draft wrote
   `fortyone.resolve("refund-classifier")` — neither SDK's signature, and not a legal prompt id
   (`CLAUDE.md`'s Naming says `pr_` plus 8 hex). It is now the module-level `resolve` from
   `@41prompts/sdk`'s README. Nothing in the suite could have failed on this; it was read off a
   screenshot.
2. **The Test panel's meter ran the full width of the card**, which reads as a progress bar for the
   page rather than as one figure inside a picture of a suite result. Capped at 220px.
3. **"the live version"** in a gate row, where ADR-003's term is **Live**.

And one thing the *first* attempt at the drive caught about the harness: a `next start` left running
across a rebuild serves HTML referencing a stylesheet the new build has renamed, so the page comes
back **unstyled** — the panels measured 199px instead of 410px and a `<pre>` overflowed by 79px.
That is exactly the failure mode the built-app drive exists to find, arriving through the door of
the drive's own setup.

**What the local drive does not cover**, stated so it does not read as a deployed one: the container
image build, the Coolify environment, Traefik, and migrations against the real database. Nothing is
pushed, so `origin/main` is behind local `main` and **no staging or production URL is evidence about
any of this**.

## 10. Dependencies

**None added.** The illustrations are existing `@41prompts/ui` components; the reserved-colour probe
is plain DOM.

## 11. Open

1. **`every-run-recorded` appears twice on the home page** — §3.1. One line either way, and the
   decision is about the page rather than about this panel.
2. **Three other specs' colour guards were fixed, which is outside this epic's Out of scope list.**
   `decompile`, `capture-share` and `soft-ship` were not this epic's business; they carried the same
   never-matching probe, and leaving three known-broken guards in place while reporting that the
   fourth was narrowed would have been dishonest. Named here rather than done quietly.
3. **The narrow-viewport panel height still varies by 153px.** §5 gives the reason for accepting it.
   If it should be clamped, the number is 545 and the breakpoint is a decision.
4. **Nothing has been pushed since before EPIC-023.** `origin/main` is well behind local `main`, and
   `docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20. That is Soroush's to cut.
