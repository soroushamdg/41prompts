# EPIC-015 session — Soft ship

**Date.** 2026-09-11. Branch `epic-015-soft-ship`, PR #42, tagged `v0.1.0`.

**Before it started.** Soroush passed a real Turnstile challenge on staging and the share went through
(`/d/dc_e1448469195a`, 87 bloks), closing the last EPIC-014 criterion — the half no automated browser
can do, because Turnstile refuses to render for one. PR #41.

---

**Planned first.** The plan's one real job was to find what would invalidate the measurement rather
than what would be hard to build, and it found it in the first twenty minutes.

**`hasAnalyticsConsent` returned `false` for an anonymous visitor in production.** EPIC-004 built it
that way on purpose and documented why. Every visitor in this window is anonymous and in production,
so it would have produced **a funnel reading zero for thirty days** — and a zero is not a missing
number, it is a wrong answer that looks like a right one. We would have taken it to GATE 1 and
concluded the wedge failed.

Decision 9 gave the direction — "a visitor who *declines* is not counted", and declining is an act — so
the default is now counted, with DNT, GPC and a declined cookie all honoured, and declining outranking
being signed in. It is a privacy default changing, so it is the first thing in the report's checklist
rather than a line in a commit message.

**The article's examples are generated, not written.** The criterion says every example comes from the
committed corpus; the way to keep that true is to render what the detectors actually return, and to
have a test assert the page quotes each message character for character. `support-email-router`
produces seven findings across four kinds on its own, which makes the article's argument without
asserting it.

**`FINDING_KINDS` became a runtime list** with a compile-time exhaustiveness check, because two
documents now promise a stranger there are exactly six and documents do not fail CI.

---

**Things that were wrong and got fixed.**

- **The article was a 500.** `@41prompts/core/fixtures` needs its own Turbopack alias — the main one
  does not cover subpaths, so it resolved to TypeScript source whose `./x.js` imports Turbopack cannot
  map. The same gap EPIC-013 hit, in a new place.
- **The scrollable prompt was not keyboard-reachable** (axe `scrollable-region-focusable`).
- **A test regex matched the sentence denying the claim it guarded against** — "It does not rewrite
  your prompt" tripped a pattern looking for "rewrites your prompt". Fixed with a lookbehind, which is
  the second time this session a naive claim-detector needed one.
- **`test.skip(condition)` at describe level skips the whole describe.** Adding the Linux-only guard to
  `/dev/ui` took its axe and keyboard tests with it. Now scoped to its own block.
- **An llms.txt test compared the origin against Playwright's `baseURL`**, which is the harness's port,
  not the app's configured URL. Replaced with the assertion that actually matters: `llms.txt` and
  `robots.txt` must advertise the *same* origin, which is the failure that would really happen.
- **The sitemap assertion** had to grow a third page once the article was listed.

**A process slip, owned rather than buried.** The commit `e01b608` went **straight to `main`** instead
of through a PR. Tests only, and CI was green on `main` before the tag — but it skipped review, which
is not how anything else here has landed.

---

**Production.** `v0.1.0`, 2026-09-12 00:17 UTC.

Production had been serving `e79dc32`, a pre-EPIC-013 build where `/decompile` returned 404 — so this
tag put the entire product in front of the public for the first time, migrations included. It came up
clean, which is the only evidence that matters for the new tables existing there.

Verified in production rather than inferred from staging: the ask bar end to end with **zero range
mismatches**, the article with six findings and six real examples, `llms.txt` and `robots.txt`
advertising the same origin, `/d/<unknown>` returning 404 with `noindex, nofollow, noarchive`, and the
article's own Open Graph card at 1200×630.

**The apex is not routed.** `41prompts.ai` resolves to the box but has no Traefik router and therefore
no certificate; production is reachable only at `app.41prompts.ai`. Everything the product says about
itself points at `app.`, so it is consistent — but findability is the thing M1 measures, and a brand's
front door returning a TLS error is a handicap on exactly that. `m1-window.md` says to leave the dates
alone if it is fixed within a few days and to move them if not.

---

**Verification tail.**

```
pnpm test        8 packages; apps/web 160, packages/core 370
pnpm typecheck   8 packages
pnpm lint        forbidden-words + boundaries clean
pnpm compliance  reuse + boundaries + forbidden-words + binary-files + license-gate + mirror-dry-run
E2E              soft-ship 11 passed; 2 pre-existing auth failures, unchanged
```

**For the next session.** Read `docs/research/m1-window.md` first. If it is before **2026-10-11**, the
answer to "should I improve X" is no — write it down and ship it on the 12th. The only permitted change
is a defect that makes the decompiler wrong or unavailable.

What is waiting: EPIC-017 (legal minimum — five placeholder pages, a footer copyright line, and the
consent banner this epic's default change now depends on), and EPIC-084, which is blocked until the
window closes.
