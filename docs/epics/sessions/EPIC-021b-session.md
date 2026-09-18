<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-021b · the compiled pane, finished

Date: 2026-09-14 · Branch `epic/021b-compiled-pane-finish`

The pane itself shipped 2026-09-12 on `epic/021b-compiled-pane`; that work has its own history and
§1 of the report is unchanged from it. This session closed the epic out.

## Prompt sent

> EPIC-021b: finish it, do not just write the report. Offset mapping, axe, keyboard operation and
> copy byte-identity are the criteria that matter and a black-box drive cannot reach them. Tick
> nothing on the strength of the pane looking right. Session file too. Its row stays current until
> those are real.

## What the ruling changed about the approach

The previous session's staging drive found that every interaction in the pane worked on the deployed
build, and stopped there — the report listed no criteria and the row stayed `current`. The ruling is
that this is the wrong evidence for these particular criteria, and it is right: **driving the
deployed page is evidence about the deployed page.** Whether the highlighted characters are exactly
the span, whether copy is byte-identical to `compile()`, whether axe is clean in both themes and
whether every span is reachable by keyboard are all claims a person watching the screen cannot
settle.

So the work was: read each criterion, find the test that actually evidences it, and where there is
none, write it.

## What was already there, and what was missing

Four of the named criteria turned out to be covered already — axe in both themes, keyboard
operation, 44px targets and reduced-motion end states all had tests in `compiled-pane.spec.ts`.
Saying so rather than rewriting them, because "finish the epic" does not mean "redo the epic".

Two were genuinely missing, and both were the same mistake in different clothes:

1. **Offset mapping was asserted on the model, not on the DOM.** `compiled-view.test.ts` runs the
   four required shapes and asserts `piece.text` — the view model. The criterion says *"the
   highlighted characters are exactly the span"*, which is a claim about a rendered, pinned element.
   EPIC-013 got offset mapping wrong twice in opposite directions and **the model was right both
   times**, which is precisely why the criterion asks about the DOM. Four new e2e fixtures pin a span
   of each shape and assert its `textContent` is exactly that blok's characters, with no neighbour
   and no separator, and that exactly one span is pinned.

2. **Copy compared against a string literal.** `expect(copied).toBe("…\n\n…\n\n")` asserts *today's*
   `BLOK_SEPARATOR` — a value that has already changed once (`compile@2`, 2026-09-12). It now calls
   `compile()` and compares to its output, which is what the criterion asks for. This is the helper
   rule from `PROCESS.md` arriving in a new costume: a literal expectation, like a convenience
   reload, quietly encodes the thing it is supposed to check.

## A fixture named CRLF that would have tested LF

Checked rather than assumed: a `<textarea>` normalises `\r\n` to `\n` in its value, so **raw CRLF
cannot reach a blok through the UI at all.** The e2e row named "CRLF" therefore exercises the
multi-line shape and the separator boundary — real coverage, but not the thing its name claims.

Rather than delete it or leave it over-claiming, the test derives its expectation from what the field
reports and its comment says exactly what it does and does not cover, pointing at the model-level
tests that do handle raw CRLF. A fixture whose name promises more than it checks is the same defect
class as everything else this week.

## State 4 is not reachable in the product

The largest finding. **"Out of date" — nobody typed here and the blok changed — cannot occur in the
running app**, because `page.tsx` recompiles every non-hand-edited span on each render, so such a
span is `in-step` by construction. Proved on staging rather than reasoned about: changing a blok
under an untouched span produced `in-step`.

The staging criterion is therefore **split, not ticked**: three states driven and screenshotted, the
fourth described with its mechanism. Report §6 asks for the ruling — keep a state Stage 4 will reach,
or amend the criterion to say three.

## Decisions

- **Did not tick axe, keyboard, 44px or reduced motion as new work.** They existed; §2 names the test
  for each rather than asserting the set.
- **Did not delete the CRLF fixture.** It covers something real; what was wrong was the silence about
  what it does not cover.
- **Did not tick the staging criterion.** Three of four states is not four.
- **Did not fix the two layout observations** (stacked `Edit by hand` buttons, centred `example`
  span). They are not criteria and not defects; report §6 offers them as observations.

## What took longer than expected

Finding that four criteria were already met took longer than writing the two that were not — most of
the time went on reading tests to check they evidenced what their names suggested, which is the whole
lesson of the week and not wasted.

## Verification

```
e2e        156 passed, 4 skipped, 0 failed   (against the BUILT app)
           compiled-pane.spec.ts alone: 22 passed (18 before; +4 DOM shape fixtures)
test       8 checked, 8 passed    (throwaway container, no PARTIAL)
typecheck  8 checked, 8 passed
lint       11 checked, 11 passed
```

## Open questions

1. **State 4** — report §6.1.
2. **The two layout observations** — report §6.2.
