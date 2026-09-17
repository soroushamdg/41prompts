# Release due

Written by `scripts/run-epics.sh` after three completed epics. **The loop has stopped and is
waiting for you.** Nothing here has been tagged and nothing will be: cutting the release is
yours.

Generated 2026-09-17T17:10:30.458Z.

## Where the two environments are

| | commit | source |
|---|---|---|
| production | `af089c7cf680174d166b87fe79e0f2314625d1b0` (env=production) | https://app.41prompts.ai/healthz |
| `main` | `217c9452f56ec8417812886b65c1030515807795` | this checkout |
| newest tag | v0.5.0 | `git describe --tags` |

Diff base: production's live commit (from https://app.41prompts.ai/healthz).

## What a `v0.6.0` tag would carry

137 commits · 696 files changed, 93428 insertions(+), 591 deletions(-)

- 217c945 Merge EPIC-055: the delivery UI, and publishing stops being an endpoint
- 24f18c5 docs(epic-055): report, session log, the backlog row and the handover
- b2142dd fix(055): the NUL-byte test contained a NUL byte, and only the CI gate could see it
- 93402a2 feat(055): the drive, and the two defects it found that no test would have
- ead101b test(055): the e2e suite for Deploy, Connect, keys and the banner — and one real defect it found
- 9d9e996 fix(055): the NUL-byte gate was pointed at two trees out of five, and missed both live cases
- 566b337 feat(055): Deploy, Connect, the keys tab, the publishing switch, the pill and the banner
- 8c3c666 feat(055): revoke and rotate as two rows, and one gate evaluation with two callers
- 7eddb03 docs(epic-055): the epic file, the plan, and ten rulings
- e63f7e8 docs: the handover's commit table was stale the moment EPIC-052 merged
- 0ef32b7 Merge EPIC-052a: document FORTYONE_BASE_URL, which the SDK reads and nothing named
- ce1259f docs(052a): FORTYONE_BASE_URL was read and documented nowhere
- 53fcec5 Merge EPIC-052: @41prompts/sdk, and the prompt finally leaves the building
- 6e68cff docs(epic-052): report, session log, decisions, the backlog row and the handover
- c3e3a96 feat(052): the drive, and the assertion it got wrong about itself
- e42de30 fix(052): the lockfile did not carry @types/node, and only the CI gate could see it
- 8092230 docs(epic-052): the epic file, the plan, and ADR-006
- ec937d6 feat(052): GET /v1/build, the ETag that could never change, and the drive
- 690b96f feat(052): @41prompts/sdk — resolve(), the three caches, and the frozen surface
- d4232cc Merge EPIC-051: publish, the gate that blocks it, and the storage it writes to
- c3a6539 docs(epic-051): report, session log, decisions, the backlog row and the handover
- 228f67e feat(051): the drive, the e2e suite, and three things they found
- 35d66b5 feat(051): publish, undo, the store, and the /v1 read API
- 0d3c275 feat(051): the publish gate in core, the audit log, and the store's rows
- 4c080d9 docs(epic-051): publish, the gate that blocks it, and the storage it writes to
- f4d6dd4 Merge EPIC-050: the build artifact, frozen at v1, and the compatibility rule
- 99a747e docs(epic-050): pin the report to the commit the final gate ran on
- ded9630 fix(050): a tampering test that flipped a padding bit was testing nothing 6% of the time
- cc31687 docs(epic-050): report, session log, decisions, the backlog row and the handover
- 8d6aa9a feat(050): the build artifact, frozen at v1, and the compatibility rule
- fd84c72 docs(epic-050): the build artifact, frozen, and the compatibility rule
- eee8b3d Merge EPIC-042: three providers, the key a person brings, and the two pivots
- 9ea1aee docs(epic-042): report, session log, decisions, the backlog row and the handover
- 22a16bf fix(042): a run that has not answered is not a run that graded nothing
- a38f681 feat(042): Settings → Providers, the provider matrix, and the "By input" heatmap
- d598ba3 feat(042): three providers behind one interface, and the key a person brings
- a808e02 docs(epic-042): three providers, the key a person brings, and the two pivots
- b488cad Merge EPIC-043: the BYO-key threat model, a sealed key store, and value-shaped redaction
- c501fc1 docs(epic-043): report, session log, decisions, the backlog row and the handover
- cda5db7 docs(043): the drive's screenshot, re-taken against the merged commit's build
- 3ce248e fix(043): the in-flight progress test raced the queue, so give it a state instead
- ee29ed8 feat(043): the BYO-key threat model, a sealed key store, and value-shaped redaction
- 2257a0c Merge the handover refresh after EPIC-041
- 685e41f docs: the handover after EPIC-041 — 043 is next, staging is ten behind
- f5e3384 Merge EPIC-041: the Versions page — history, diff, restore, A/B
- 2cf975a docs(epic-041): report, session log, the drive, decisions, and the backlog row
- 0fe43fe fix(041): a change to the check set is a change, and two drive corrections
- e188874 feat(041): the Versions page — history, a semantic diff, restore, and A/B
- bdc2b88 docs(epic-041): the Versions page — the epic file and the plan
- e871ba2 Merge the refreshed handover page
- 3ee16bc docs(handover): the page was two days stale and named a finished epic as next
- 1a63b9a Merge EPIC-040: versions and semantic diff
- 52ef402 docs(epic-040): report, session log, the drive, decisions, and the backlog row
- 69f8af4 feat(040): a version is a frozen blok set, and a diff says what changed
- da42eee Merge GATE 3's decision and EPIC-040's epic file and plan
- 83ed1b4 docs(epic-040): GATE 3's decision, the epic file, and the plan
- 4afbe70 Merge the GATE 3 readiness note, re-read after the first real call
- 4e75554 docs(gate-3): the readiness note's load-bearing sentence is no longer true
- b62433f Merge EPIC-031a: the first real Anthropic call
- 6a64fb2 docs(epic-031a): report, session log, decisions, and the backlog row ticked
- ca70def fix(anthropic): capture the resolved model, and stop calling our view a raw payload
- 22d9021 Merge the release-due instruction fix
- 5739f09 fix(release-due): the notice told Soroush to pull, and origin is behind
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
