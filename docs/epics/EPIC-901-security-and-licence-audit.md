<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-901: Dependency, licence and security audit — the first run, and the machine that makes the next one cheap

Stage: Ongoing · Depends on: EPIC-007 · Size: **M** (the backlog says S; see §Size below)

**Written by Claude Code in the advisor's chair**, 2026-09-18, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 to EPIC-057 and EPIC-072 set.

`docs/roadmap.md`, Ongoing:

> **EPIC-901** monthly: `pnpm audit`, `pip-audit`, gitleaks, read the SBOM and licence gate output,
> key rotation check.

`docs/roadmap.md`, EPIC-007's Review line:

> Artifacts uploaded. **EPIC-901 references them.**

`docs/epics/reports/EPIC-007-report.md`, "Skipped (out of scope, per the epic)":

> … **dependency vulnerability scanning (EPIC-901's monthly audit)**.

## Goal

The repository has a security and licence audit that runs as **one command**, reports every check
with its own verdict, and **shows only what is new** — and this month's findings are triaged and
written down rather than left as background noise.

## Why this row, now

It has never run. The repository is 3.4 weeks old, has 639 workspace dependencies and 250 commits,
and three of the five checks on the roadmap's line have been executed exactly once each — by hand,
inside EPIC-007, in August. EPIC-007 deferred vulnerability scanning to this row by name and closed
with an open question this row is the answer to:

> **17 real, pre-existing private-package licence findings** … now show as warnings on every
> compliance run … but they were invisible before this epic and are **worth an actual look rather
> than permanent background noise**.

A monthly check that nobody runs covers nothing (`docs/PROCESS.md`, on the e2e container). A monthly
check that reports 13 findings it has reported every month since the first one covers nothing
either, for a different reason: after the second month nobody reads it. Both failure modes are the
same one — a verdict that cannot change is not a verdict — and the baseline in scope item 2 is the
whole of what separates this from either.

## Scope

1. **`scripts/audit.mjs`, run as `pnpm audit-run`.** The five checks of the roadmap's line, each
   with its own verdict in `scripts/gates.mjs`'s reporting shape — **PASS**, **FAIL**, **PARTIAL** —
   exiting non-zero if any failed:

   | check | what it runs |
   |---|---|
   | `npm-advisories` | `pnpm audit --json` across the workspace |
   | `python-advisories` | `pip-audit` against the Python distribution's resolved dependency set |
   | `secrets` | `gitleaks detect` over the whole history |
   | `licences` | `scripts/license-gate.mjs`, including the CycloneDX SBOM it writes |
   | `key-inventory` | every secret named in the inventory is still referenced by the code, and every secret the code references is in the inventory |

   **A missing tool is PARTIAL with the reason, never a silent skip** — `gitleaks` and `uv` are not
   on every machine, and `docs/PROCESS.md`'s `PARTIAL` verdict exists for exactly the case where
   "the tool is not here" would otherwise be indistinguishable from "nothing was found".

2. **`docs/security/audit-baseline.json` — the accepted findings, and the only reason a finding is
   allowed to be silent.** One entry per accepted finding: what it is, why it is accepted, who
   accepted it, and the date it is looked at again. **Checked in both directions**, which is the
   repository's own rule (EPIC-072's Lighthouse waiver, `legal-entity.test.ts`'s allow-list):
   a finding not in the baseline **fails**, and a baseline entry that no longer matches anything
   **also fails**, because a stale exemption is how a gate quietly stops catching what it exists for.

3. **`docs/security/key-inventory.md`.** Every secret this system holds: where it lives, who can
   rotate it, the procedure, and when it was last rotated. This is the roadmap's "key rotation
   check". **Rotating a key is Soroush's**; knowing what there is to rotate is not, and nothing in
   the repository currently lists them in one place.

4. **`docs/security/audit-2026-09.md`** — the first run's findings, each triaged, with the reasoning
   written down rather than compressed into a baseline entry.

5. **The proprietary boundary covers every proprietary tree, not four packages.**
   `scripts/license-gate.mjs` already treats *"an Apache-2.0 SPDX header appearing on a file inside
   [a proprietary package], which is a grant by accident"* as a hard failure — over
   `packages/ui`, `packages/db`, `packages/logger` and `apps/worker` only. `REUSE.toml` declares
   six more trees proprietary and the gate has never looked at them. The check is extended to every
   tree `REUSE.toml` covers, and the headers it finds are corrected.

## Out of scope

- **Bumping `vitest` to 4.x.** The advisory's patched range starts at `4.1.11` and the workspace is
  on `^3.2.7` in ten manifests; that is a major upgrade across every package's test suite and it is
  its own change, not a line in an audit. Triaged in §4 and entered in the baseline with a date.
- **Rotating any key.** The inventory lists them; turning them over is Soroush's and needs
  Coolify, three provider consoles and a deploy.
- **Editing `docs/decisions/*`.** `CLAUDE.md`'s never-touch list. Four files there carry the wrong
  licence header and they are named for Soroush rather than fixed.
- **Adding the audit to `node scripts/gates.mjs ci`.** That mode's whole claim is parity with CI,
  and CI runs neither `gitleaks` nor `pip-audit`. A mode that runs gates CI does not run is as
  divergent as one that prunes CI's list — see `docs/AUTONOMOUS.md`, "The gate is `scripts/gates.mjs`,
  whatever it currently does".
- **EPIC-900's tech-debt sweep**, dead-code pass, dependency upgrades and infra drill. Different row.
- **Anything on the box.** `gitleaks` and `pnpm audit` read this repository. Nothing here connects to
  staging or production.

## Acceptance criteria

- [ ] **A1.** `pnpm audit-run` runs all five checks and prints a table naming every one with its own
      verdict, the way `node scripts/gates.mjs test` does. Verified: the table in the report.
- [ ] **A2.** A check whose tool is missing reports **PARTIAL** with the reason and the run says in
      as many words that it is not a full pass. Verified: `apps/web/audit.test.ts`, and the report's
      transcript of a run with `PATH` stripped of `gitleaks`.
- [ ] **A3.** A finding that is not in `docs/security/audit-baseline.json` **fails** the run.
      Verified: `apps/web/audit.test.ts`, with a control that the same finding passes once baselined.
- [ ] **A4.** A baseline entry that matches no current finding **also fails** the run. Verified:
      `apps/web/audit.test.ts`.
- [ ] **A5.** `docs/security/key-inventory.md` lists every environment variable the code reads that
      carries a credential, and the `key-inventory` check fails if the code and the document
      disagree in **either** direction. Verified: `apps/web/audit.test.ts` and a run.
- [ ] **A6.** `scripts/license-gate.mjs`'s proprietary-boundary check covers every tree `REUSE.toml`
      declares proprietary, and fails on an Apache-2.0 header inside one. Verified:
      `apps/web/license-gate-boundary.test.ts`, with a positive control (a proprietary-tree file
      given an Apache header fails) and a negative one (a public-package file keeps its header).
- [ ] **A7.** Every accidental Apache-2.0 header in a proprietary tree is corrected, except the four
      under `docs/decisions/` which are named one by one in the gate's `HEADER_EXEMPT` and handed to
      Soroush in the report. They belong in the **gate**, not the audit baseline: `pnpm license-gate`
      runs in `compliance.yml` and has to pass, and a baseline entry would not make it. Verified:
      `pnpm license-gate` green, `license-gate-boundary.test.ts` asserting the list is exactly those
      four and that each still needs its exemption, and the report's file count.
- [ ] **A8.** `docs/security/audit-2026-09.md` records every finding of the first run with its
      triage. Verified: the file, and `apps/web/audit.test.ts` asserting the month's document exists
      and names every finding the baseline carries.
- [ ] **A9.** `node scripts/gates.mjs ci` green on the commit, all steps. Verified: the report's gate
      table.
- [ ] **A10.** No user-visible surface changes. This epic ships no route and no UI string, so the
      browser-drive item is answered by its own numbered section in the report — the EPIC-030 §11
      shape — **plus** a drive of the built app proving the licence-header change broke nothing that
      renders. Verified: screenshots in `docs/epics/reports/screenshots/EPIC-901/`.

## Verification

```
pnpm audit-run                     # the five checks; exit 0 when nothing is new
pnpm audit-run --explain           # what each check runs, without running it
pnpm test --filter @41prompts/web  # audit.test.ts, license-gate-boundary.test.ts
pnpm license-gate                  # the extended proprietary boundary
node scripts/gates.mjs ci          # the only CI there is
```

## Notes for the implementer

- **`pnpm audit --prod` is misleading here and the reason is worth knowing.** It reports the same
  three advisories as the full run, through paths like `apps__web>better-auth>vitest`. `vitest` is
  an **optional peer dependency** of `better-auth@1.7.2`, so pnpm walks the peer edge back to our
  own devDependency. Do not report "vitest is a production dependency" — it is not. Report what
  `apps/web/Dockerfile` says instead, which is the thing that actually matters and is written in its
  own comment: *"Runner keeps the full pruned workspace, devDependencies included"*.
- **The 13 gitleaks findings are test fixtures and each one must be read before it is baselined.**
  Baselining a real key because twelve of its neighbours were fake is the whole risk of this file.
- **`SECURITY.md` and `TRADEMARKS.md` are Apache-2.0 on purpose** — `scripts/mirror-dry-run.sh`
  ships both to the public repository. They are not part of §5.
- The `-linux` visual baselines are not touched by anything here; nothing this epic changes renders.
- `docs/security/` already holds `byo-key-threat-model.md` and `sdk-threat-model.md`. Same place.

## Size

`docs/backlog.md` and `docs/roadmap.md` both size this **S**, and it is **M**. The five checks are S;
scope item 5 is not, and it was not visible from the row. Recorded here and in
`docs/decisions/AUTONOMOUS.md`. **The backlog's Size cell is not edited** — `docs/AUTONOMOUS.md`'s
carve-out is the status cell of the epic being worked and nothing else, which is EPIC-056's
precedent exactly.
