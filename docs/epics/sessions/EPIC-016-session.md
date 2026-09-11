# EPIC-016 session — Landing page v1

**Date.** 2026-09-11. Branch `epic-016-landing`, PR #36.

**Before it started.** Soroush set the Turnstile keys and asked me to verify the path on staging.
Sharing was broken: the variable had been entered as `TURNSTILE_SITE_KEY` against the code's
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, which put the deployment in a state nobody had considered — secret
set, site key missing, so no widget, so no token, so *every* share refused with a message blaming the
reader. Fixed in PR #35 before this epic started: the two keys are atomic now, all three EPIC-014
variables are in `.env.example` (their absence is why the name got retyped), and Turnstile finally has
tests, which the criterion had asked for and never got. Full account in `EPIC-014-report.md` §11.

---

**Planned first, in `plan-EPIC-016.md`.** The plan's one real job was deciding the transport before
anything got styled, and it is what the epic file itself points at: *"the exact words are the
implementer's to draft"* is the visible risk, but the invisible one is a 100 KB paste crossing a page
boundary.

**The transport.** A query string would have shipped and looked fine. It is also how the prompt would
have ended up in browser history, in the `Referer` of every outbound click, in proxy access logs, and —
once EPIC-015 wires PostHog — in analytics, on a page that says in three places that nothing is
stored. `MAX_INPUT_BYTES` is 100 KB, which rules out cookies too, and an App Router page cannot read a
POST body. So: the text stays server-side in a single-use handoff, sixty seconds, bounded at 64
entries, and an opaque id travels. Deleting on read is the part that matters — it stops a
`?start=` URL in a history list from being a working link to someone else's prompt.

**The headline.** Five drafted, one shipped, four in the report with reasons. The one worth recording
here is *"Every prompt has rules. Almost none of them are checked."* — the most literally accurate of
the five, and the only one containing an invented number. **"Almost none" is a frequency claim we have
no data for**, on a page whose whole discipline is not making those. The sentence that sounded most
rigorous was the one that broke the rule.

**The truth audit is a test, not a paragraph.** The criterion asks for "a line in the report confirming
the check was made". A line ages badly, so `page.test.tsx` enforces it instead — and the assertion that
earns its keep is the number allowlist: every digit on the page has to be listed with a reason or the
build fails. A counter is the easiest lie to add and the hardest to spot in review, because it looks
like data.

---

**Things that were wrong and got fixed.**

- **A textarea's `value` is not what the form submitted.** The DOM's "API value" always reports LF,
  whatever went over the wire. The first CRLF fixture asserted CRLF there and failed. The round-trip
  check now compares against LF; the *range* check is what proves the server holds CRLF.
- **`encodeURIComponent` threw on an emoji fixture** because `slice(0, 12)` cut a surrogate pair in
  half. Replaced with a stronger assertion anyway: the whole query string must be `?start=<32 hex>`,
  which encoding cannot hide from.
- **The logo morph broke hydration.** The inline script mutates `d` before React hydrates. Fixed with
  `suppressHydrationWarning` on the two paths plus starting on `load`; without it every page load
  logged a hydration error and the console stopped being worth reading.
- **The logo test raced itself**, reading the "at rest" path from the DOM after the animation had
  already started. Now it compares against the known `logoPathsAt(0)` string and waits only for
  `domcontentloaded`.
- **axe: heading-order.** The strip used `h3` under an `h1`. axe is right that skipping a level is a
  lie about the structure; they are `h2` now and CSS carries the size.
- **The forbidden-word grep caught `label`** in `SiteLink` — ADR-003 forbids it in *code identifiers*,
  not just UI strings. Renamed to `name`. Thirteen places.
- **Renaming a button broke `auth.spec.ts`.** "Send sign-in link" → "Send a sign-in link" reads better
  and was not mine to change: the epic says style those pages, not rewrite their words. Reverted.
- **A stale dev server on port 3100** held the in-memory decompile rate limit across four suite runs
  and produced a wave of failures that looked like the handoff was broken. The tell is *"That is the
  limit for now"* rendered on the page.
- **Running the suite dirties committed evidence.** `capture.spec.ts` rewrites EPIC-013's screenshots
  every run. Restored them; noted in the report so the next person does not commit macOS renderings of
  somebody else's epic.

**Two things not done, and not faked.**

- **Visual-regression baselines.** They have to be Linux to match CI. Docker's VM had 1.5 GB free
  against an image needing 2 GB+, and the only way to make room was pruning volumes belonging to
  another project on this machine. The tests are written and skip until the baseline exists; the exact
  command is in the report. A `-darwin` baseline would have been worse than none — CI would fail on a
  missing snapshot either way, and the file would look like evidence.
- **Google and GitHub against staging.** Needs OAuth apps for the staging hostname. Magic link is
  covered end to end. A human step, like the Turnstile keys were, and recorded as one rather than
  guessed at.

**Two pre-existing e2e failures**, verified by stashing every change in the branch and re-running on
the untouched tree: `magic-link sign-up lands on /app showing the email` and `sign-out kills the
session server-side` fail identically on `main`. Not caused here and not fixed here.

---

**Verification tail.**

```
pnpm test        8 packages, 140 tests in apps/web (13 files)
pnpm typecheck   8 packages
pnpm lint        353 files, no issues + boundaries + forbidden-words clean
pnpm compliance  reuse + boundaries + forbidden-words + binary-files + license-gate + mirror-dry-run
pnpm binary-files  347 checked, none binary

E2E_PORT=3100 npx playwright test landing   32 passed, 2 skipped (Linux baselines)
E2E_PORT=3100 npx playwright test           106 passed, 2 pre-existing auth failures
```

**Open questions.** Four, at the end of `docs/epics/reports/EPIC-016-report.md`: the headline itself;
whether the logo's "end state" is the round trip it is built as or the `AI` far end; that the public
repository `packages/core` already advertises does not exist; and that the handoff is per process like
the rate limiter, which one durable store would fix for both.

**For the next session.** EPIC-015 (soft ship, which starts M1's 30-day clock) and EPIC-017 (legal
minimum — this epic has left it five placeholder pages to fill and a footer copyright line to add).
Before EPIC-015 announces anything: the public mirror has to exist, the Coolify variable rename has to
land, and the visual baselines want generating.
