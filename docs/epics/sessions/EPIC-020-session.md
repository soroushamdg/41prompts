<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-020 session log

Date: 2026-09-12 · Branch `epic/020-compiler`

## Prompt sent

Two pieces of work in one session, in this order.

**First, a copy fix carried over from #50.** The closing band's heading becomes "Most prompts have
rules nothing checks."; record the corpus count in the report as the evidence; and record, as a gap
rather than a task, that `page.test.tsx` catches invented counts, social proof and fake urgency but
cannot catch a confident assertion about the reader.

**Then EPIC-020.** Commit the advisor's `docs/epics/EPIC-020-compiler.md` as-is, mirror it into
`CURRENT.md`, mark EPIC-020 current and Stage 1 complete in the backlog, plan into
`plan-EPIC-020.md`, implement, self-review, push, PR, squash-merge once CI is green. Two warnings
with it: *"Write the span-tiling invariant before the compiler"*, and *"the distinction between 'this
span no longer matches the blok' and 'the blok changed after someone edited this span' is the thing
to get right; if the model cannot express both, the model is wrong and you should say so rather than
blur them."*

## Plan summary

`docs/epics/plan-EPIC-020.md`. Its §0 settled the two-facts model **before any code was typed**,
because that was the stated risk. Order of work was a commit boundary: invariant first, then types
and hash, then `compile`, then the three functions, then checks and the artifact schema, then the
EPIC-011b tripwire, then fixtures and perf, then docs.

## Decisions, and why

1. **Two booleans plus `state`, not one flag and not an enum.** Settled in the plan by working out
   all four cells and finding the one that breaks a single flag: a blok reclassified `context` →
   `constraint` has a moved hash and byte-identical rendered text. `state` is carried as well because
   *(edited by hand, changed)* and *(compiled, changed)* have identical booleans and different
   sentences. Full table in the report §1.
2. **`PromptBlok`, not `Blok`.** The decompiler's `Blok` has a content-derived id, which is right for
   a decompile and exactly wrong for something editable — a span refers to a blok by id, so every
   keystroke would orphan its span.
3. **`CompiledSpan`, not `Span`.** ADR-003 names the type. An epic sketch does not rename a decision
   record.
4. **`updateFromBlok(compiled, bloks, blokId)`.** The epic's two-argument version cannot work;
   `Compiled` holds hashes, not text. A correction, not a preference.
5. **`buildHash`, not `buildSha`.** `CLAUDE.md`'s Naming and Vocabulary sections contradict each
   other. The vocabulary rule is the one ADR-003 decided and the one with a grep behind it; the
   contradiction is raised in the report rather than resolved in Soroush's file.
6. **A span owns the separator that follows it, and every span has one including the last.** Spans
   tile the text, so the separator belongs to somebody; a uniform rule keeps reordering a pure
   permutation of identically-shaped pieces. Costs a trailing blank line, which is recorded.
7. **`render()` is the identity function in v0.** The structure seam exists and does nothing, because
   decoration is text nobody wrote and cannot be judged without a pane.
8. **`Check.kind` optional and absent rather than defaulted.** A ninth kind contradicts ADR-003; a
   default of `must_contain` asserts a substring nobody wrote.
9. **`order` not in the hash.** So reordering invalidates nothing.
10. **The cache is caller-owned.** Module state would make `compile()` impure in the way that matters
    and would survive between tests.

## What took longer, or went differently

- **The tripwire fired on the first commit, by design, and that created a sequencing problem worth
  recording.** EPIC-011b's `never-compiled.test.ts` fails the moment `packages/core/src/compile`
  exists — which happened before `compile()` did. Rather than leave a red commit or weaken the
  tripwire, its first commit got the half that *can* exist before a compiler, and that half turned
  out to be the stronger one: the invariant makes rule 3 mechanical over every input, where the
  end-to-end test only covers the cases somebody wrote. The full end-to-end assertion landed with the
  function, as its instructions asked.
- **Two test assumptions were wrong and the code was right.** "Never mention the system prompt."
  *does* match a rule shape (`must_not_contain`), so the fixture gained a fourth expected blok with
  genuinely unmatched text to exercise the kindless path. And the drift snapshot initially carried
  only three of the four cells while its comment claimed four — the fixture was changed to make the
  comment true rather than the comment softened.
- **The warm-cache measurement came out flat**, because `render` is identity. Recorded as flat with
  the reason, and the test renamed so it does not imply a speed-up nobody measured.
- **The corpus count for the copy fix was re-measured from source rather than repeated**, and the
  result does not support the word that shipped: 11 of 25 is 44%, under half. Shipped as decided,
  with the number recorded in front of the decision.

## Verification tail

```
 ✓ src/compile/invariants.test.ts      (19 tests)
 ✓ src/compile/compile.test.ts         (25 tests)
 ✓ src/compile/drift.test.ts           (20 tests)
 ✓ src/compile/checks.test.ts          (14 tests)
 ✓ src/compile/snapshots.test.ts       ( 9 tests)
 ✓ src/compile/compile.perf.test.ts    ( 3 tests)
 ✓ src/artifact/schema.test.ts         ( 6 tests)
 ✓ src/summarise/never-compiled.test.ts( 5 tests)

 Test Files  26 passed (26)
      Tests  468 passed (468)

compile(200 bloks): 0.428 ms — 117x headroom on a 50 ms budget
drift(200 bloks): 0.433 ms

Tasks: 8 successful, 8 total                        (pnpm test)
Tasks: 8 successful, 8 total                        (pnpm typecheck)
Checked 402 files in 8 packages, no issues found    (pnpm lint)
[mirror-dry-run] OK                                 (pnpm compliance)
No tracked source file under packages, apps is binary (386 checked)
```

## Open questions

Carried in the report §8, in full. The three that need a ruling before EPIC-021b:

1. **Adding a blok to a prompt with hand-edited spans.** No answer exists in this model, on purpose —
   it is a pane decision. Two candidates named.
2. **The separator.** The mockup joins spans with one newline; the compiler uses a blank line, and
   `CLAUDE.md` says the mockups are the spec. One constant if the ruling goes the other way.
3. **`CLAUDE.md`'s "Build sha" line** contradicts its own vocabulary rule.

Plus, from the copy work: `page.test.tsx` cannot catch a confident assertion about the reader, and
neither can the visual baselines — both recorded as gaps in `docs/reports/host-split-report.md`.

## Handoff

EPIC-020 is on `epic/020-compiler`. `CURRENT.md` points at EPIC-020. The backlog marks it `current`
and Stage 1 complete, with **EPIC-017 (legal minimum) explicitly carried as still `todo`** — its
pages are stubs, EPIC-014 shipped against it, and the "a report for every epic before the next stage"
rule is waived for it by decision rather than met.

---

# Addendum — four rulings, same session (2026-09-12)

Soroush ruled on everything the report raised, in one pass, and asked for it in one PR.

## What was ruled, and what was done

1. **Copy.** Heading → "Prompts usually have rules nothing checks.", with the count as the evidence.
   **Flagged again, and this is the third time:** "usually" and "most" are the same quantifier, and
   44% reaches neither. Shipped as decided; the standing offer to drop to the number itself is on the
   table and recorded in `docs/reports/host-split-report.md`.
2. **The baselines absorbing a heading change is a defect, not an observation.** The band heading is
   now asserted by text in `page.test.tsx`, next to the hero sentence that was already pinned that
   way. The 1% pixel tolerance stays — it is right for anti-aliasing and wrong as a copy guard, which
   was the point. **The new assertion was proved to fail before it was trusted**, by changing the
   heading to "often" and watching that one test go red.
3. **The separator: the mockup wins.** `BLOK_SEPARATOR = "\n"`, `COMPILER_VERSION = "compile@2"`,
   fixtures and snapshots regenerated. The ruling came with "say so if it makes two adjacent prose
   bloks read as one paragraph", so it was measured — see below.
4. **`CLAUDE.md`'s Naming line** corrected to "Build hash", so the file agrees with ADR-003.
5. **Both pane problems carried into EPIC-021b** as named requirements, in
   `docs/epics/notes-EPIC-021b.md`, with the two candidates for the first and the four-row banner
   table for the second.

## The separator cost, measured rather than assumed

The prose case was real. **A second effect was found that nobody had raised**, and it is the larger
one: with a single newline, a blok boundary is indistinguishable from a newline inside a blok's own
text. A list blok followed by an example blok now runs together with nothing between them.

Measured on the committed corpus: **25 of 160 bloks contain a newline in their own text, reaching 14
of the 27 multi-blok prompts.** So in about half the corpus, at least one boundary is unrecoverable
from the compiled string. Under `"\n\n"` only 5 bloks had that ambiguity.

Nothing in the product breaks — spans carry the offsets, so attribution and drift are unaffected and
every test passes. What is lost is structure in the string the *model* receives, which is the part no
test can see. Written up in the report §6.2 for the revisit that was offered, with a middle option
named and its own cost stated.

## What was checked and deliberately left alone

`compile/invariants.test.ts`'s hand-built cases still use a two-character tail where a separator would
sit, while `BLOK_SEPARATOR` is now one character. That is not drift and a comment now says so: the
invariant checks tiling from the offsets it is given and must not assume a separator length. Rewriting
those cases to match the compiler would make the test agree with the code it is checking.

---

# Addendum 2 — two rulings, one reversed on evidence (2026-09-12)

1. **Copy settled at "Prompts often have rules nothing checks."** Fifth version, third correction. The
   report now carries the pattern rather than just the outcome: **the count was right every time and
   the quantifier was wrong every time.** 11 of 25 was measured once and never moved; three successive
   headings reached past it, each by a smaller margin. The instruction for next time is in the report —
   *reach for the number before the adjective*.

2. **The separator ruling was reversed on the measurement.** Back to a blank line, `compile@3`.

   Worth recording as process rather than as a constant: the previous ruling was made on
   `CLAUDE.md`'s "the mockups are the spec", the implementation was shipped, the cost was measured on
   the corpus, and the measurement changed the decision. Two version bumps and a snapshot
   regeneration — which is precisely what `COMPILER_VERSION` is for, and the three-version history is
   now the best argument in the codebase for having it.

   **The middle option was rejected on a harder ground than taste**, and the reasoning is in
   `hash.ts`: a separator that depends on a span's neighbours means editing one blok changes the bytes
   of the span before it (breaking rule 4, which this epic exists to guarantee) *and* that span's
   `hash` does not move with its bytes, because `blokHash` covers only the blok's own text and kind.
   The cache would hand back output that no longer matches. Same failure the "separator is a constant,
   not an option" rule already prevents, arriving by a different door.

3. **The lasting output is in `docs/design/README.md`**, under corrections: **the prototypes are the
   spec for the interface, not for the compiled string.** The compiled pane was always where this
   would surface — it is the one surface that displays a string a model also reads, and those two
   readers want different things. Two properties of the failure are recorded with it: nothing in the
   suite could see it, and nobody was choosing what a model receives, because a prototype's attention
   stops at the pane.

## One correction made while in that file

`docs/design/README.md` said *"EPIC-020 owns picking a real per-kind mapping [for blok category
colour], or confirming ink-only is permanent."* EPIC-020 could not take that debt — its scope puts
"any UI, canvas, or compiled pane" explicitly out of scope, and it shipped without touching colour.
Repointed to EPIC-021a/EPIC-021b, which build the canvas the mapping would appear on. Flagged rather
than done quietly, because reassigning somebody else's debt is a decision.
