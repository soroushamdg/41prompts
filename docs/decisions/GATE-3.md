<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# GATE 3 — the decision

**Decided by Soroush, 2026-09-16.** Written down by Claude Code from his ruling in session, not
made by it. The input to this decision is `docs/epics/GATE-3-readiness.md`, which offered two
readings and chose neither.

**The row bundles two questions. They are answered separately.**

## 1. Stage 3 exit — proceed to Stage 4? **Yes.**

Stage 3's software is built, tested, driven, and has now been answered by a real model at a known
price (`$0.02` for a 2-input run, EPIC-031a). What is missing is not an epic: it is one `git push`
and three short drives on staging. Blocking Stage 4 on an afternoon's work is the wrong trade.

**Stage 4 starts with EPIC-040.**

## 2. Loud launch — run EPIC-035? **No. Deferred.**

Two things are not ready, and a launch is the one step that cannot be taken back:

- **The judge has never met a real model.** `claude-haiku-4-5-20251001` is pinned, priced and
  tested against a fake. EPIC-031a's last checklist item — a `refuses_to_answer` check graded for
  real — was not driven, because the example prompt has no such blok.
- **Rule 6's promise is currently kept by a normalised view.** The privacy page describes raw
  provider payload retention to users, and `result.response?.body` came back undefined on the first
  real call. `ca70def` makes the gap legible; it does not close it.

**EPIC-035 stays `todo` and unscheduled.** It is not `cut`. It is reconsidered when the judge has
run against a real model.

## What this decision does not waive

- **Criterion 5, five observed users activated, is unmet and knowingly waived**, not met. It needs
  recruited people, which Soroush's standing instruction of 2026-09-15 defers. It is named here so
  that no later reader finds it ticked.
- **Criteria 1–4 are sampled, not measured.** One real run is not 100; one real failure attributed
  on screen is not ten seeded ones. The gate's own word is *measured* and this decision proceeds
  without that, deliberately.

## The three conditions on the Go

Not blockers on starting EPIC-040 — work owed before Stage 4 closes:

1. **Push `main`**, so staging takes `ca70def` and the three unticked EPIC-031a criteria become
   provable: the resolved model id, a cached repeat at zero, and one real judge call.
2. **Drive those three** on staging once it is serving the pushed commit.
3. **Answer whether a normalised view satisfies rule 6** — either the rule's wording follows
   reality, or the adapter obtains the body another way. Cheaper now than after EPIC-042 puts two
   more providers behind the same adapter shape.

## Also outstanding

A release is due: four epics have merged since the last one, production is at `af089c7` and 79
commits behind, and the newest tag is `v0.5.0`. `docs/epics/RELEASE-DUE.md` has the commit list.
That is a separate decision and is not made here.
