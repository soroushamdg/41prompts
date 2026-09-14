<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-017 · Legal minimum

Date: 2026-09-14 · Branch `epic/017-legal-minimum`

## Prompt sent

Soroush's ruling, in summary: no lawyer, write all of it, one epic, make it good. Cookie choice with
a privacy-preserving default is the only part with real exposure and the only build. Research
properly rather than templating. Retention numbers must be exactly right and cited. Name every
processor honestly, verified against the code. One line at the top of terms and privacy saying no
lawyer reviewed them, and no warnings anywhere else.

## The thing that changed the shape of the epic

**Reading `lib/analytics/posthog-server.ts` before writing anything.** The gate was already built and
already correct — opt-in for anonymous visitors in production, `DNT` and `Sec-GPC` outranking
everything, and the cookie name reserved with a comment naming this epic. EPIC-004 had done the hard
part and EPIC-015 had briefly undone it and been reverted within a day, and that round trip is
recorded in the file.

So the estimate "part 1 is a build" was right about it being a build and wrong about what was
missing. It was never the gate. It was the control, and the ability to change your mind — which is
the half the law actually cares about and the half a banner alone does not provide.

## What research changed

Two things came out of reading rather than assuming:

1. **Consent has to be as easy to withdraw as to give**, under both Law 25 and the GDPR. That turned
   "a banner" into "a banner **and** a permanent control", and the permanent one is the one that
   makes the choice real.
2. **Blocking has to happen before the script runs**, not behind a banner overlay while the tag has
   already fired. That is already true here because the decision is server-side, which is stronger
   than the usual client-side pattern — worth knowing so nobody "improves" it into a client-side
   blocker later.

## Three things the brief did not have

- **A fourth retention number.** `RUN_COUNT_RETENTION_DAYS = 180`, enforced in `purge-decompiles.ts`.
- **Seven processors, not eight.** AWS and GitHub were in nobody's list; four of the roadmap's eight
  are not wired at all.
- **The 12-month row has no code behind it.** It says so, and names EPIC-031.

All three came from grepping `package.json`, the environment variables the code reads, and
`requireEnv` calls, rather than from the roadmap's list. The roadmap's list was a plan; the code is
what is true.

## A defect introduced, and where it surfaced

The banner is `position: fixed`, so it covered the last control on every long page. **It broke the
canvas and the variables tab, and it broke them as two click timeouts in unrelated specs** — nothing
that looked like a consent bug at all. Fixed by reserving the measured height.

Then CI went red on four visual baselines, and the obvious fix was the wrong one: the banner mounts
from an effect, so a baseline containing it is flaky by construction. Answering the question
deterministically in the visual tests meant the committed baselines were already byte-identical —
verified both ways inside the Linux Playwright image.

## Decisions

- **Did not change `hasAnalyticsConsent`'s signed-in branch.** It is EPIC-004's tested decision; the
  privacy page states the behaviour precisely instead and the report asks for a ruling.
- **Did not add a copyright line.** `CLAUDE.md` keeps the holder as `<legal entity>` until
  incorporation.
- **Deferred the DPA draft and the standalone transfer assessment to EPIC-071**, whose row already
  depends on this epic. The assessment's substance is on the privacy page; what is deferred is
  producing it as its own document.
- **Kept the "Not in use yet" section** rather than omitting unwired processors, so the page is not
  quietly incomplete when they arrive.
- **Renamed `LegalBlock` to `LegalPart`** because ADR-003 forbids the word, then read the diff and
  found the blanket rename had corrupted a line of prose.

## What took longer than expected

The banner itself was quick. The two surprises were the overlay defect — which cost a full e2e cycle
to find and a second to confirm the fix — and the visual baselines, which needed the Linux container
to settle honestly rather than by guessing. Writing the prose took the largest single block, which is
correct for an epic whose deliverable is mostly prose.

## Verification

```
e2e        178 passed, 4 skipped, 0 failed   (against the BUILT app)
test       8 checked, 8 passed    (throwaway container, no PARTIAL)
typecheck  8 checked, 8 passed
lint       11 checked, 11 passed
compliance all OK
staging    19 assertions, all PASS, at 4913f3e
```

## Open questions

1. **Should analytics consent be universal?** A signed-in user who has never chosen is still counted.
   One line, but it belongs to EPIC-004. Report §6.
2. **`privacy@41prompts.ai` needs to exist.** The pages name it as the route for every right and for
   security reports. It is a DNS/forwarding step, not code, and nothing here can do it.
