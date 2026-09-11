# CURRENT

**EPIC-013 is done** — every acceptance criterion below is checked with evidence in
`docs/epics/reports/EPIC-013-report.md`, including the staging deployment: `/decompile` is live at
<https://staging.41prompts.ai/decompile>, driven by hand with **zero range mismatches** against the
deployed build. The session log is `docs/epics/sessions/EPIC-013-session.md`.

**Reworked after Soroush drove it on staging** (2026-09-10): the bloks read as an undifferentiated
list, so they are now grouped by kind in `BLOK_KINDS` order with a heading and count per group, each
card carries a persistent ink marker distinguishing kind by **shape** plus the kind's name as text,
and a view control switches between grouped and source order, grouped by default and remembering
nothing. Report §9 and §10.

370 tests in `packages/core`, 38 in `apps/web`, 67 in `packages/ui`, 28 end to end, axe clean in both
themes and on the empty state. Both carried debts are paid: EPIC-011a's fixture gap (corpus 25 → 29,
classifier accuracy 96.7% of 60 → 96.7% of 92) and EPIC-012a's cross-kind `repeated` presentation.
Four open questions are at the end of the report. This file stays pointed at EPIC-013 until the next
epic is written and copied here per `docs/PROCESS.md`'s loop.

**The finding worth carrying forward:** two separate things eat characters between a pasted prompt and
the DOM. The HTML parser replaces `\r\n` and lone `\r` with `\n` before any script runs, and the form-
submission algorithm normalises a textarea to CRLF on the way in — so almost every submission is CRLF
at the server, and **EPIC-014 will be capturing CRLF whatever the author's editor used**.

**Stage 1's remaining epics:** EPIC-017 (legal minimum, which must land before `/decompile` reaches
production traffic), EPIC-014 (capture, purge, rate limits, abuse checks), EPIC-016 (landing page),
EPIC-015 (soft ship), then EPIC-084 reads the funnel against M1's kill criterion. Nothing in this epic
pre-built any of them.

**EPIC-005 and EPIC-080 are `cut`** — Soroush's decision, 2026-09-10. Both of EPIC-080's questions
that fell to this epic are answered in it: touch discoverability, by making touch the default rather
than the fallback, and summary trust, by showing `Summary.source` as plain words and nothing more.

---

# EPIC-013: Public decompiler
Stage: 1 · Depends on: EPIC-003, EPIC-012b · Size: M

## Goal
`/decompile` ; paste a prompt, get it back as named bloks with findings and a source map, no signup. This is the
first thing anyone outside this room sees, the whole of M1, and the only measured signal that the wedge is right
(300 unique decompiles in 30 days, ≥15% share-or-waitlist; roadmap kill criterion).

## Standing note on research
EPIC-005 and EPIC-080 are cut. The prototypes are the spec, corrected by `docs/design/README.md`. Two debts land
here as a consequence: **whether a summary needs an unverified cue** (EPIC-080's orphaned question ; this epic
decides it, by showing `Summary.source` plainly and nothing more until the funnel says otherwise), and the touch
discoverability question, which this epic answers by making touch the default rather than the fallback.

## Decisions (do not re-litigate)
1. Public route, no auth, no signup wall. Server-rendered result; the core pipeline runs on the server so the
   client ships no algorithm and a slow phone is not punished.
2. Layout: source text on one side, bloks on the other, findings in a panel. Below `md`, they stack; the source
   map stays reachable by scrolling, not hidden behind a tab.
3. **Bidirectional linking.** Hovering or focusing a blok highlights every one of its ranges in the source with a
   leading colour marker at each range; hovering a highlighted range surfaces its blok. Selecting a blok **pins**
   the highlight so it survives moving the pointer away. Keyboard: tab to a blok, `Enter` pins, `Escape` unpins.
   Touch: tap pins, tap again unpins ; and touch is the default interaction, not a degraded hover.
4. Colour: highlight is **ink inversion**, not a colour wash (design rule). Blok category colours appear only
   during interaction, never persistently. Green, red and amber are reserved for pass, fail and drift and appear
   **nowhere in this epic** ; findings are not pass/fail. Severity is carried by position, weight and a text
   label, not by hue alone.
5. **Findings panel ordering**: `rule_without_check` is the call to action, not one finding among many. It appears
   in its own section at the foot of the panel, headed by a single line naming how many rules nothing checks, with
   the individual findings beneath it. The other five findings sit above, ordered as `detect()` returns them.
   This is the answer to EPIC-012b's open question 4: it closes the panel, it does not crowd it.
6. `Summary.source` is shown as plain text on each blok card ("summarised by rule" / "summarised by model"). No
   badge, no icon, no warning colour. If the funnel later shows summaries are over-trusted, that is a data change.
7. Input cap: 100 KB, enforced server-side with a clear message naming the limit (carried from EPIC-011a's open
   question 3). Empty and whitespace-only input produce a calm empty state, not an error.
8. Every interactive element works by keyboard and by touch; `prefers-reduced-motion` shows end states (rule 12).
   Highlighting must be announced to assistive technology, not conveyed by visual change alone.
9. No persistence, no permalink, no rate limit, no analytics event beyond a page view in this epic. EPIC-014 adds
   capture, purge, rate limits and abuse checks; EPIC-015 adds the funnel. Do not pre-build them.
10. `packages/core` is imported, never reimplemented (rule 1). The page contains no segmentation, clustering or
    detection logic of its own.

## Scope
- `apps/web/app/decompile/page.tsx` and its server action: paste, submit, render.
- Components from `packages/ui` only; anything missing is added there, not inline in the page.
- Source map rendering with per-range leading markers, pin/unpin, and correct offset-to-DOM mapping over text
  containing CRLF, tabs, emoji and RTL runs.
- Blok cards: kind, summary with its source, range count when greater than one.
- Findings panel per decision 5.
- Empty state using an illustration from `docs/design/41prompts-illustration-system.html`, copied verbatim.
- **Fixture debt from EPIC-011a**: add at least two multimodal prompts and two prompts written as expectations to
  the corpus, and re-run the classifier accuracy table with them included; report the number.
- **Presentation debt from EPIC-012a**: a `repeated` finding may name bloks of different kinds; the card must show
  both kinds so the pairing reads sensibly.

## Out of scope
- Permalinks, sharing, capture, purge, rate limits, Turnstile, abuse checks. (EPIC-014.)
- `llms.txt`, the companion article, PostHog funnel, Search Console. (EPIC-015.)
- Landing page, nav, footer, sign in. (EPIC-016.)
- Editing a blok, saving, projects, accounts. (Stage 2.)
- Any use of green, red or amber.

## Acceptance criteria
- [x] `/decompile` renders server-side for a pasted prompt with no account; a Playwright test drives paste →
      result. Evidence: test name.
- [x] Hover, focus and tap each highlight every range of a blok, with a leading marker at each range; pinning
      survives pointer-away; `Escape` and a second tap unpin. Evidence: four test names.
- [x] Hovering a highlighted range surfaces its owning blok. Evidence: test name.
- [x] Offsets map correctly to the DOM for CRLF, tabs, emoji with combining characters, and RTL text ; the
      highlighted characters are exactly the range. Evidence: four fixtures and their tests.
- [x] The findings panel places `rule_without_check` in its own closing section with a count line; the other five
      kinds appear above in `detect()` order. Evidence: snapshot and a screenshot.
- [x] A `repeated` finding across two kinds shows both kinds on the card. Evidence: fixture and screenshot.
- [x] Each blok card states whether its summary came from a rule or a model, as plain text. Evidence: screenshot.
- [x] Input over 100 KB is refused server-side with a message naming the limit; empty and whitespace-only input
      show the empty state. Evidence: three test names.
- [x] Axe clean in both themes; highlight changes are announced to assistive technology. Evidence: axe output and
      the ARIA test name.
- [x] Full keyboard operation with a visible focus ring; touch targets ≥44px at the small breakpoint; with
      `prefers-reduced-motion` every transition shows its end state. Evidence: three test names.
- [x] Grep proves green, red and amber tokens are unused on this route. Evidence: the check.
- [x] No segmentation, clustering or detection code exists in `apps/web`; dependency-cruiser confirms the import
      direction. Evidence: the rule name.
- [x] Corpus extended with two multimodal and two expectation prompts; classifier accuracy re-run and reported.
      Evidence: the number, before and after.
- [x] Forbidden-word grep passes over every string on the route.
- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files` clean.
- [x] Deployed to staging and driven by hand once; paste the URL and a screenshot into the report.
- [x] Report and session log written; backlog updated.

## Verification
```
pnpm test && pnpm typecheck && pnpm lint && pnpm e2e && pnpm compliance
curl -s https://staging.41prompts.ai/decompile | head
```

## Notes for the implementer
- The prototype `docs/design/41prompts-decompiler.html` is the interaction spec, but its algorithms are the ones
  EPIC-011a found three false merges in. Take the interaction, not the logic.
- Offset-to-DOM mapping is where this epic will actually go wrong. Build the four text fixtures first and check the
  highlighted characters, not the highlighted elements.
- Copy is product copy. The empty state and the 100 KB message are read by strangers with no context.
- If a decision here contradicts `docs/design/README.md`, the README's corrections win; say so in the report.
- If an acceptance criterion is impossible, write `docs/epics/BLOCKER-EPIC-013.md` and stop.
