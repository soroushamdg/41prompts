# Release due

Written by `scripts/run-epics.sh` after three completed epics. **The loop has stopped and is
waiting for you.** Nothing here has been tagged and nothing will be: cutting the release is
yours.

Generated 2026-09-16T01:51:58.306Z.

## Where the two environments are

| | commit | source |
|---|---|---|
| production | `af089c7cf680174d166b87fe79e0f2314625d1b0` (env=production) | https://app.41prompts.ai/healthz |
| `main` | `f3fa8a264612f7ee54c60d6ff9fca4365f7e20e9` | this checkout |
| newest tag | v0.5.0 | `git describe --tags` |

Diff base: production's live commit (from https://app.41prompts.ai/healthz).

## What a `v0.6.0` tag would carry

74 commits · 404 files changed, 45522 insertions(+), 513 deletions(-)

- f3fa8a2 Merge the new-session prompt
- e61daac docs: the session that stopped at GATE 3, and the decision it logged
- f283524 Merge the GATE 3 readiness correction
- 95dd7f1 docs(gate-3): the readiness note was written before the key was set
- 7090ce8 docs: the prompt to start a new session with
- 2079633 Merge EPIC-031a plan: the first real call, and its verifier
- 1bc1555 docs(backlog): EPIC-031a is planned rather than deferred
- bbe6d5f feat(031a): the first real call, planned — and a verifier that refuses to be fooled
- ac2f1a4 Merge GATE 3 readiness note
- 16915a3 docs(gate-3): what the gate can be decided on, and what it cannot
- 1d04f96 Merge EPIC-034: activation onboarding — the path, not the measurement
- bcc1e8a test(core): the tag-cost gate reports instead of enforcing, and why sampling could not save it
- 12e5cec docs(epic-034): report, session log, decisions, and the backlog row ticked
- 7775850 fix(runs): a finished run whose check failed is not given a pass tick
- 448d6e4 feat(activation): signup to a first passing run, and the number nobody can compute yet
- 2a6e53d Merge EPIC-033: the pinned LLM judge, and the inbox it turned out not to have
- c003567 docs(epic-033): report, session log, decisions, and the backlog row ticked
- e7910e2 feat(judge): the EPIC-033 drive, and a banner that was covering the evidence
- b88298c feat(judge): the pinned LLM judge, and the inbox it turned out not to have
- f4e950a Merge EPIC-032: web — inputs, run, results, attribution
- 9661097 docs(epic-032): report, session log, and the backlog row ticked
- 1f982fc feat(runs): a run detail page says which run it is, and the drive is committed
- b550035 feat(runs): input sets, the run trigger, results by check, attribution
- 4c5c904 docs(process): nothing is pushed, and the drive moves to the built app
- e1200a6 docs(epic-032): the epic file, completed, and CURRENT points at it
- c18ea03 chore(backlog): four rows deferred, and an unwritten row stops the loop (#96)
- cb4fb61 fix(e2e): pnpm e2e has what it needs, or says what it does not (#95)
- 8b9f6b8 fix(e2e): a skip reports as a skip, and on linux it fails (#94)
- 9911be4 fix(gates): a mode that reproduces CI, and the five failures that needed it (#93)
- b398e2b chore(autonomous): the gate is whatever gates.mjs says it is, resolved at run time (#92)
- b43173f chore: the hash rule becomes a gate, and a handover page (#91)
- 61012ca chore: the unattended epic runner, and the standing instruction it runs (#90)
- c96413b fix(gates): binary-files sees untracked files, and the key-joining audit (#89)
- f291457 EPIC-031 (2/2): money that cannot be overspent, and a promise the page now keeps (#88)
- df2ce75 docs: EPIC-031's plan, for review before implementing (#86)
- 1a78b4c EPIC-031 (1/2): the runs table and a purge that can be checked before next year (#87)
- c622765 docs: EPIC-030's two handovers, written where they will be read (#85)
- 5f47597 EPIC-030: expected bloks become checks that execute, and answer honestly (#84)
- cc81e22 docs: EPIC-030's epic file and plan, for review before implementing (#82)
- e7536f1 docs: the universal-consent staging drive, and two corrections to EPIC-017's report (#83)
- d3fb87f fix(web): analytics consent is universal, and signup/login finally go through it (#81)
- cde1348 docs: the roadmap's check-kind list points at the code instead of copying it (#80)
- 3139fc1 docs: EPIC-017 closes — the staging drive, the session log, and Stage 1 clear (#79)
- 4913f3e EPIC-017: the legal minimum, written rather than placeheld (#78)
- 988b9b0 docs: Stage 2 closes — EPIC-022 passes on the re-drive (#77)
- d6f4d2b three rulings: state 4 stands, one Sign out, and the drive tidies up (#76)
- e7ffec3 EPIC-021b: finish the pane's evidence, not its report (#75)
- d4df9b7 fix(web): the account page joins the app, and the chrome stops wrapping (#74)
- d3bcc03 fix(web): the workbench never learned what a blok said, only that it existed (#73)
- 04031ff docs: one rule for three failures — a helper that normalises state hides the defect (#72)
- 192477d docs: the Stage 2 staging hand-drives, and the three defects they found (#71)
- fe6f864 docs: Claude merges again, the deployed-drive mechanism, the R2 bucket row (#70)
- e5fa776 fix(web): /app was a dead end; sign-in now lands somewhere you can work from (#69)
- 34dba50 EPIC-022: variables (#66)
- 197124d ci: cancel superseded runs, and skip CI on a documentation-only change (#67)
- cd0a78f chore: a local gate reports every package, or it is not evidence (#68)
- 52716f8 Licensing honest while the repo is public; the boundary gets a gate (#65)
- 68fe0b7 EPIC-021b: the compiled pane (#61)
- 9488eff EPIC-009 closes; the apex gap becomes EPIC-006b (#64)
- ce70a90 docs: criterion 1 ticked by this epic's own merge, and the second measurement
- 50c9831 EPIC-009: the Coolify half, measured — and the healthcheck Coolify could not see (#63)
- f75569b EPIC-009: Actions budget — image builds move to tags only (#62)
- f5f875b fix(auth): the session cookie prefix is per deployment (#60)
- 1dfe853 chore(e2e): screenshot generators leave the default run (#59)
- d52370a chore: refuse a commit on main, with a hook rather than a memory (#57)
- 5af2b71 fix(e2e): the 60-blok test waits for each add instead of racing sixty (#58)
- aeecc60 EPIC-021a: staging verified, canvas screenshots, and an instructions fix they caught (#56)
- 8d62a9d EPIC-021a: projects, prompts, and the blok canvas (#55)
- eca7d0a fix: "often", and the separator back to a blank line (#54)
- d2e8f33 fix: four rulings — heading, its guard, the separator, and CLAUDE.md (#53)
- 4f8cf09 EPIC-020: blok model and per-blok compiler (#52)
- 0fc9940 docs: cancel the M1 measurement programme (#51)
- 2849e69 fix(copy): the closing band restates the reason instead of echoing the footer (#50)
- f41d46d fix(copy): the footer says what the product does, and record the verification (#49)

## To cut it

**`main` itself has to be pushed first.** Since 2026-09-15 nothing is pushed by the agent
(`CLAUDE.md`, "Nothing is pushed"), so `origin/main` is **behind** this checkout rather than
ahead of it. `git pull` is not the first step and would do nothing; the tag has to point at a
commit the remote actually has.

```
git push origin main                             # the commits above only exist locally
git tag v0.6.0 && git push origin v0.6.0
```

Pushing `main` runs `ci.yml` and `compliance.yml` once, and redeploys **staging**. Expect
the first push after a long gap to go red: `docs/PROCESS.md`'s "Local green is not CI green"
names the Linux and clean-checkout differences a local gate cannot see. Fix those before
tagging — a tag is what moves **production**.

The tag then triggers `build-images.yml` (both images to GHCR) and Coolify's production deploy,
and `deploy.yml` creates the GitHub Release. Read `infra/RUNBOOK.md` first if this is a large
one — the 2026-09-13 incident is why the loop stops every three epics instead of letting the
gap grow.

## Then

Delete this file and restart the loop:

```
rm docs/epics/RELEASE-DUE.md
scripts/run-epics.sh
```
