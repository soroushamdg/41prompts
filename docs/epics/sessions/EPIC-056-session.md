<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-056 — session log

**2026-09-18.** One session, interactive, started from `PROMPT_CONTINUE`. Branch
`epic/056-open-source-split`. Written as if the next session has no memory of this one, because it
does not.

## Where the project was, checked rather than remembered

`PROMPT_CONTINUE` says to work out where the project is from git and the filesystem rather than from
any document, so:

```
git log --oneline -15          → c53dd8b, "docs: the handover and RELEASE-DUE, at EPIC-057"
git status                     → clean
git rev-list --count origin/main..main  → 96
ls docs/epics/reports/         → 40 reports, through EPIC-057
node scripts/pick-next-epic.mjs → GATE: ▣ GATE 3
```

**The loop was stopped, twice over, and neither stop was mine to step past.**

1. **The picker stops on `▣ GATE 3`**, whose status cell reads `—`. Both GATE 3 (2026-09-16) and
   GATE 5 (2026-09-17) are **decided**, in `docs/decisions/`. `GATE-5.md` says so itself: *"One word
   in each unsticks the picker, and both are Soroush's to write."* `docs/backlog.md` is on the
   never-touch list and the one carve-out is the status cell of the epic being worked.
2. **Past the gates, the next row is EPIC-056**, which `GATE-5.md` records as **"Not buildable"** —
   it needs `github.com/41prompts/41prompts`, npm and PyPI trusted publishing (EPIC-006, `deferred`)
   and an IP assignment to a legal entity that did not exist (EPIC-071, `deferred`) — with the
   instruction that a run reaching it writes a `BLOCKER`.

So the session began by reporting both and asking. **Soroush answered that the org, the accounts and
the IP assignment are all done**, which is the exact set `GATE-5.md` names, and gave the four facts
nothing in the repository can derive:

| | |
|---|---|
| legal entity | `41Prompts Inc.` |
| GitHub | `41prompts/41prompts` — what the four `prepublishOnly` guards already test for |
| registered | npm scope `@41prompts`, PyPI `41prompts` |
| **not registered, available** | npm `41p`, PyPI `fortyone-prompts` |

That last row is why the epic builds up to the first publish and does not perform one.

## Plan summary

`docs/epics/plan-EPIC-056.md`, written before any code. Nine steps, ordered so that each inherits the
one before: the substitution first, because every file this epic creates carries a header and writing
the placeholder into new files to strip it out again in the same epic is wasted motion; then the
mirror, because it decides what the public tree *is*; then governance, READMEs and workflows, which
have to land inside that tree.

**The plan's measurements changed the epic file before it was committed.** Two of them:

- The six Apache-2.0 `LICENSE` files end with `Copyright [yyyy] [name of copyright owner]`. That is
  the **licence's own appendix**, not a claim, and filling it in is editing the licence text. The
  acceptance criterion was corrected, and it corrects `docs/roadmap.md`'s Review line.
- `sdks/python/tests/test_packaging.py` asserts the **old** repository URL and would fail the moment
  the manifests moved. That is the test doing its job, so the order was: change the manifests, watch
  it fail, then invert it.

**The risk the plan named did not bite.** 53 snapshot fixtures carry headers and a suite comparing
file bytes would have failed; `pnpm test` straight after the substitution was 9 of 9.

## What found what — worth carrying forward

Four defects, and **the mechanism that found each one is more reusable than the fix**:

1. **`packages/cli-unscoped` was missing from the mirror filter.** Found by reading the `--path` list
   against what the workspace publishes, while writing the test for A9. `41p` publishes with
   `provenance: true` and a `prepublishOnly` that only passes inside `41prompts/41prompts`, so its
   source was absent from the one repository it can be published from. **Nothing failed**, because a
   tree with a package missing is a smaller working tree that installs and tests perfectly.
2. **`license-gate.mjs` was filtered on a package name that does not exist.** Found by writing
   `dependency-review.yml`'s allow-list, claiming in a comment that it matched the gate's, and then
   checking. It did not — and reading the gate to fix that surfaced `@41prompts/sdk-ts`, which is the
   directory, against the package `@41prompts/sdk`. **Writing a comment that asserts a relationship
   and then verifying it** is what did this; the first draft would have shipped a false comment.
3. **Three root config files had no licence information in the public tree.** Found by adding
   `pnpm compliance` to the dry-run, which had only ever run the public tree's *tests*. It failed on
   its first run, 361 of 364.
4. **The control found a weak assertion.** A9 asks for the mirror check to be proved to fire.
   Removing a path produced **one** failure where two were owed: the "present in the filtered tree"
   test sliced the script to the end of the file and matched a later `echo` line. **Running the
   control rather than asserting it** cost two minutes.

And one I introduced and caught: **`SECURITY.md` invented `security@41prompts.ai`** while
`/legal/security` has published `privacy@41prompts.ai` since EPIC-017. Found by grepping the legal
module for the addresses it publishes before writing the report, not by review.

## What took longer than expected

**Docker, and it was the documented obstacle rather than a surprise.** The gate's closing block
flagged that the four visual baselines skip on darwin, and this epic moved two of them. The official
Playwright image needs more than 2 GB; the VM had 1.7 GB free — the same wall EPIC-016 hit and wrote
down. Pruning 31 dangling volumes freed 1.766 GB and the image fitted, then the VM hit 100% and a
subsequent image prune reclaimed the image itself along with everything else.

**The recovery was better than the original plan.** Rather than EPIC-016's heavy first procedure —
copy the monorepo in, `pnpm install`, build — the container drove the **host's already-built,
already-running** server through a `socat` tunnel, which fits in the space available and reuses the
build the drive had just made. The tunnel is not a convenience: both specs set the consent cookie on
`domain: "localhost"`, so driving `host.docker.internal` would have put the consent banner into every
baseline.

**The harness was validated before anything it wrote was committed.** The `/dev/ui` gallery baselines
were generated in the official image during EPIC-003 and CI has matched them ever since; they pass
unchanged through this harness. Then, and only then, the landing pair was regenerated — measured
first at 1280×1451 expected against 1280×1502 actual, which is 51px of copyright line and fails on
dimensions whatever the pixel tolerance says.

## Decisions, and why

Fourteen, appended to `docs/decisions/AUTONOMOUS.md`. The three that would be hardest to reconstruct:

- **Historical prose is not rewritten.** Nineteen matches describe the placeholder as a fact of their
  own date. `ADR-002` is left for a second reason as well — never-touch — and handed over in report §7.
- **The footer says `41Prompts Inc.` where the mockup says `41Prompts`.** The mockups are the spec and
  this departs from one deliberately: a `©` names a holder, not a brand, and that word is the epic.
- **The public tree gets its own `REUSE.toml`**, and `LICENSES/` is filtered file by file so the
  proprietary licence text stays behind.

## The tail of the verification output

```
  16 step(s), all passed                       node scripts/gate-run.mjs (run 2)
  16/16 checks passed                          npx tsx scripts/drive-epic-056.mts
  4 passed                                     the baseline harness, control + target
  Files with copyright information: 364 / 364  the public tree's own reuse lint
  ✔ no dependency violations found (213 modules, 553 dependencies cruised)
  289 passed                                   sdks/python, inside the filtered tree
```

## Open questions

Report §7 has them with reasons. In one line each: ADR-002 now reads as current and is not;
`docs/roadmap.md`'s Review line cannot be met as literally written; is `41Prompts Inc.` the exact
registered form, now that it is in 433 places; `privacy@41prompts.ai` must exist; and is a public
`ci.yml` wanted, noting that Actions is free on public repositories.

## For the next session

**Nothing here is published and nothing is pushed.** Report §8 lists seven steps that need a person,
none of them ticked. The two that matter most, in order:

1. **`41p` on npm and `fortyone-prompts` on PyPI are unregistered.** This is EPIC-057's row `057b`
   and it is the one finding in this project that **expires**.
2. **The repository does not exist yet as far as this checkout knows.** `pnpm mirror-dry-run`
   rehearses the extraction completely and pushes nowhere.

**Stage 5b now has a report for every epic**, which is what `docs/backlog.md`'s stage rule wants
before Stage 6 starts. The next rows are EPIC-070 (Stripe — needs an account) and EPIC-072 (marketing
site final — buildable, depends on 016 and 055, both done). Neither has an epic file.

**`STOP` is still present in the repository root**, dated 2026-09-14. It stops
`scripts/run-epics.sh`, not an interactive session, and it was left exactly as found.
