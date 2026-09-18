<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-057 — session log

**Date.** 2026-09-17, one session, hand-started by Soroush rather than by `scripts/run-epics.sh`.

**The prompt.** A file called `prompt_continue` in the repository root: read `CLAUDE.md`,
`docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`, `docs/backlog.md` and
`docs/decisions/AUTONOMOUS.md` in that order; work out where the project actually is from git and the
filesystem rather than from any of them; then pick up the next epic and build it to the Definition of
Done, ending by asking whether to close the session or continue.

---

## Where the project was, checked rather than remembered

`git log --oneline -15` — EPIC-054 merged as `db96cfc`, then three docs commits. Tree clean. 82
commits on local `main` that `origin/main` does not have. `ls docs/epics/reports/` — 38 reports,
EPIC-055 and EPIC-054 both present. `docs/epics/RELEASE-DUE.md` regenerated at EPIC-054's merge and
current.

**A `STOP` file is in the repository root.** `docs/epics/HANDOVER.md`'s Housekeeping section says it
has been there since 2026-09-14, halts `scripts/run-epics.sh` between and during epics, and **does
not affect a session a person starts by hand.** It was left alone.

**`scripts/pick-next-epic.mjs` printed `GATE: ▣ GATE 3` and stopped**, as EPIC-054's report and the
handover both predicted it would. That gate **is decided** — `docs/decisions/GATE-3.md`, 2026-09-16,
go for Stage 4 with the loud launch deferred — and Stage 4, 5a and 5b have all been built past it.
What stops the picker is a stale status cell reading `—`, which is `docs/backlog.md` and therefore
Soroush's. So the next epic was taken from the handover's "Start here" and from the Stage 5b table:
**EPIC-057**, with EPIC-056 named as not reachable.

`prompt_continue` says a gate row is Soroush's decision and not to step around it. Stepping around an
**undecided** gate is what that forbids; this one has a decision file, and treating a stale cell as an
undecided gate would have re-litigated a ruling he has already made. That reading is in
`docs/decisions/AUTONOMOUS.md` rather than only here.

**EPIC-057 had no epic file.** `docs/PROCESS.md`'s amendment of 2026-09-15 puts Claude Code in the
advisor's chair when no advisor is relaying, and EPIC-040 through EPIC-055 are the precedent. So the
epic file was written first, with the roadmap's Tasks/Tests/Review lines quoted verbatim and a Goal
line written because the roadmap gives none.

---

## Plan summary

`docs/epics/plan-EPIC-057.md`. Eight steps, and the order was the point: **probe first, then fix,
then write the document.** A threat model written against a system nobody probed is how a finding
becomes a paragraph nobody can act on, so nothing went into the document until it had been measured.

Four probes before any code was changed:

1. **`fetch` across an origin redirect.** Two loopback servers on two ports. The second origin
   received `(absent)`; the same-origin control still carried the header. `network.ts`'s comment had
   asserted this since EPIC-052 and nothing had checked it — and EPIC-054 found the equivalent claim
   was *false* for `urllib`.
2. **The unbounded body read.** A server streaming 1 MiB at a time: `response.text()` returned
   **64 MiB** and the heap grew 66.9 MiB, with **no `content-length`** to have checked because a
   chunked response has none. That last detail decided the implementation and, later, the revert.
3. **The cache directory.** `mkdirSync(recursive)` gives `0755` under umask 022. `tmpdir()` is
   `/var/folders/…/T` at `700` on macOS and `/tmp` at `1777` in a Linux container. And the one that
   mattered: **`mkdir(mode: 0o700)` does nothing to an existing directory** — an attacker-created
   `0777` stays `0777`.
4. **The marker endpoint's rate.** Unlimited, as the roadmap's Tests line implies.

---

## Decisions, and why

Twelve rulings, all appended to `docs/decisions/AUTONOMOUS.md`. Ten were taken while writing the epic
file; two arrived from the work.

**Ruling 11 — the 15 KB bundle budget refuses all three TypeScript SDK mitigations.** Found *after*
they were written and working, which is why the report's table is four measurements rather than an
estimate. The cheapest single mitigation is 290 minified bytes and ADR-006 leaves 239. ADR-006
anticipated the budget binding and wrote the answer — *"measure what got in, not widen the number,
which is a Review line"* — and §6 settles that it is the minified bytes, so the 6,187-byte gzip figure
is not an escape either. The code was reverted and the finding shipped. Row 057a is Soroush's, with
three named options.

**Ruling 12 — my own rate limiter was a way to lock a customer out.** The first version peeked at the
address bucket *before* `keyFromRequest`, to stop a caller trying keys buying a database lookup per
attempt. A pre-auth gate sees only an address, and a customer's fleet shares an egress address with
everything behind that NAT — so anybody could have spent a target's sixty unauthenticated requests
deliberately and had that customer's whole fleet refused before authentication. Checked rather than
assumed: `keyFromRequest` does no query with no header, and `apiKeyForPlaintext` refuses a malformed
token before it reaches one, so the cost being bounded was nearly nothing. Removed.

---

## What took longer than expected

**The bundle budget, by a long way.** Writing the three mitigations took about as long as expected;
establishing that they cannot ship took four separate measurement rounds — the full version, a
compact streaming reader, a post-read length check, and the cache check alone — plus a module-level
breakdown of the baseline to confirm there was no slack to reclaim. None of that was wasted: it is
what turns "it did not fit" into a table somebody can decide from. But it is most of an hour spent
proving a negative.

**Two Bash rejections cost a few minutes each.** A heredoc naming the NUL escape was refused twice
by the tool's own control-character check, which is a reasonable thing for it to refuse; the commit
message went into a file instead.

**And the NUL byte cost three rounds rather than one, because I kept writing prose about it.** The
first was in `rate-limit.ts` (twice). Fixing it meant writing a report paragraph explaining it, which
put one in the report; writing the session log's version of the same sentence put one here. The
lesson is narrow and real: **the only safe way to name that escape is to describe it, or to write the
bytes through something that cannot interpret them.** The final sweep walks every tracked, modified
and untracked file rather than only the one the gate names, because the gate reports the first NUL in
the first offending file and a fix-and-rerun loop tells you nothing about how many there are.

---

## What found what — worth carrying forward

| what found it | what it found |
|---|---|
| **reading the code with the epic's question in hand** | a content address is not a signature — finding 3, the most serious thing here, and it was sitting under a comment that had described the problem correctly since EPIC-052 |
| **probing before writing** | `fetch`'s redirect behaviour (true), the 64 MiB read (real), `mkdir`'s mode being a no-op on an existing directory (the reason the fix is two things) |
| **asking how the drive would demonstrate the limit** | ruling 12's lockout, *before the drive was written*. Every test of the wrong version passed, because each was written from the same premise |
| **`pnpm binary-files`** | **four** raw NUL bytes across three files: two in `rate-limit.ts` in the very line whose comment explains why the source must carry the escape, then one in the report and one in this file, both in the prose *about* that. Every one of them written by a tool interpreting the escape I was trying to name |
| **`pnpm forbidden-words`** | "artifact" in a message a caller reads, where ADR-003 wants "build" |
| **`pnpm typecheck`** | one real type error the test suite could not see, in a `delete` on an inferred spread type |
| **checking the document's own claims** | three wrong ones in the first draft: four npm publish guards not three, no mechanical guard at all on the two Python distributions, and `hashlib` being stdlib while Ed25519 is not |

**And one process lesson with a general form.** The NUL byte nearly shipped because the gate was run
as `pnpm binary-files 2>&1 | tail -3 && git commit` — a pipeline's exit status is the *last*
command's, so `tail` succeeded and `&&` proceeded on a red gate. Lesson 24 says run the gate again
after the last file; the companion is **read its exit code, not its last three lines.** Every gate
after that was checked with `echo $?`.

---

## The tail of the verification output

```
CI mode — every gate CI runs, every result
  checkout · git clone + checkout 8a0ad293    PASS   0m02s
  ci.yml   · install, lint, typecheck, db:migrate, test, playwright, e2e, pytest
                                              all PASS   (e2e 6m25s, 4 skipped on darwin)
  compliance.yml · reuse lint, boundaries ×2, forbidden-words, binary-files,
                   license-gate --sbom, mirror-dry-run
                                              all PASS
  16 step(s), all passed, 10m46s wall
gate: all green
```

```
17/17 checks passed        (npx tsx scripts/drive-epic-057.mts, against next start on a real build)
```

Local, before the commit: `pnpm test` 9/9, `pnpm typecheck` 9/9, `pnpm lint` 12/12, no `PARTIAL`.
`sdks/python` 289 tests and `mypy --strict` clean.

---

## Open questions

All in the report's §6, and all Soroush's. In the order that matters:

1. **Registering the five package names** — the only finding here that *expires*. Row 057b.
2. **The 15 KB budget**, and whether a security fix may move it. Row 057a. Until it is answered the
   two SDKs have different security postures and the Node one is weaker.
3. **Signing the build.** Row 057c.
4. **Rate limits that survive a second web container.** Row 057d.
5. **The external review hour.** Row 057e, and report §8.
6. **`▣ GATE 3`'s status cell.** Still `—`; the picker still stops there. One word, and the file is
   his. Unchanged from EPIC-054.

---

## For the next session

**EPIC-056 is next in the Stage 5b table and is not reachable.** `docs/decisions/GATE-5.md` has the
table: it needs `github.com/41prompts/41prompts` (EPIC-006, `deferred`), npm and PyPI trusted
publishing (same), and an IP assignment to a legal entity that does not exist (EPIC-071, `deferred`).
A run that reaches it should write `docs/epics/BLOCKER-EPIC-056.md` rather than a half version.

**`run-state.mjs` was deliberately not written to.** This session was hand-started while `STOP` is in
place, and writing a state file would make `scripts/run-epics.sh` resume an epic it never started.
Nothing depends on it: the work is in the commits, the report and this file.

**A release is now eleven epics overdue.** 040, 041, 042, 043, 050, 051, 052, 055, 053, 054 and now
057, against the three `docs/AUTONOMOUS.md` allows. `docs/epics/RELEASE-DUE.md` should be regenerated
at this merge with `node scripts/release-due.mjs`.
