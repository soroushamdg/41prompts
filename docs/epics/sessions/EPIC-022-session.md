---
epic: EPIC-022
date: 2026-09-13
---

# EPIC-022 session log

## Prompt sent

Plan first, stop for review, then implement under three rulings and two reinforcements. The
reinforcements were that rename gets its test before its feature and is built first, and that preview
substitution never touches compiled bytes.

## What the plan found before any code

One thing needed a ruling and the plan stopped on it rather than choosing: the roadmap asks for a
"finding for unused declared", and `article-examples.test.tsx` asserts `FINDING_KINDS` has length six
and that the shipped guide page contains the words "six ways". A seventh kind fails a test written on
purpose, against copy that promises a stranger there are six.

The recommendation was a separate `VariableIssue`, and the reasoning was accepted as the ruling: the
six are claims about prose we did not write; a variable problem is a decidable fact about a schema we
own. It is now in ADR-003, so the rule outlives the assertion that enforces it.

## Decisions taken while building, not in the plan

1. **`emitsText` extracted.** The plan said to derive "is this a use" from the compiler rather than
   re-list kinds. Doing it meant moving EPIC-020 decision 6's comparison into its own module, which
   `compile.ts` now calls too. One line says which kinds emit text.

2. **A hand edit is the text that ships.** Not in the plan and it should have been. `extractVariables`
   takes the same `keep` map `compile()` does, and an occurrence carries whether it came from the
   blok or from a hand edit. Without this, a `{{customer}}` typed into a hand edit would ship
   unreported — which is exactly the defect ruling Q2 describes.

3. **`nameStart`/`nameEnd` on every occurrence.** So a rename replaces only the name and leaves
   `{{ customer_name }}`'s spacing alone. Reconstructing the brace form would work and would quietly
   reformat somebody's prompt.

4. **The rename transaction lives in `packages/db`.** It started in the server action and Drizzle's
   transaction type would not accept the `Db`-typed helpers. The type error was the right answer to
   the wrong design: moving the whole write into `applyRename` put every part of it in one place and
   kept Drizzle out of `apps/web`, which is what the thin query layer is for.

5. **Two tabs, not four.** A disabled tab that does nothing tells a reader the feature is here and
   broken rather than not here yet.

## The guard that fired

`pattern-shape.test.ts` refused the build until both new regex literals were on its reviewed list
with reasoning. First new patterns in the package since that gate was written, and it worked.

## Mid-turn process change

The advisor changed the process during this epic: **the agent no longer merges.** Commit, push, open
a PR, report the number and the gates, stop. Recorded in `PROCESS.md` next to tags-are-releases and
one-PR-per-epic, with its reason — pushing and merging were one motion, so nobody outside the agent
ever saw the tree in the state it landed in.

Four PRs (#61, #63, #64, #65) had already been merged by the agent earlier in the same turn, under
the previous process. That is noted in the rule itself rather than left for a reader to wonder about.

## Verification

`typecheck` 8/8 · `lint` 482 files clean · forbidden-words clean · `binary-files` clean ·
`license-gate` intact · 54 core tests · 10 preview tests · 9 db tests that need `DATABASE_URL`.

## Open

The staging hand-drive is the last criterion. The `Assertions` tab is deliberately absent rather than
stubbed.
