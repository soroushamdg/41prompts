# Plan: EPIC-001 Follow-up (F1–F4)

Re-read for this plan: `CLAUDE.md`, `docs/PROCESS.md`, `docs/decisions/ADR-001-stack-and-structure.md` (2026-09-04
Revisions block — hosting move, the SSH-access supersession with the advisor's dissent and six mitigations,
allow-list boundaries), and `docs/epics/CURRENT.md` in full, including the Follow-up section (F1–F4). Branch is
`epic/001-followup`, cut from `origin/main` (`fd7b57d`). One commit per F-item, in order, per the instruction.

## 0. State checked before planning

- **Working tree already carries uncommitted edits** to `docs/decisions/ADR-001-stack-and-structure.md`,
  `docs/epics/CURRENT.md`, and `docs/epics/EPIC-001-infrastructure.md` — the ADR revision block and the Follow-up
  section itself. These are advisor-owned files (CLAUDE.md's "never touch" list) and I am not adding to them
  beyond what's already there. But they need to land in git for `epic/001-followup` to be coherent, so **my
  proposal is to fold them into F1's commit as-is** (F1 is the policy-change commit; these three files are that
  policy change's record). Flagging this explicitly for approval rather than silently deciding it — if you'd
  rather commit these yourself separately before I branch, say so and I'll rebase off that instead.
- **`~/.ssh/config` has no `41p-box` entry and `~/.41prompts/staging.env` does not exist yet** on this machine.
  There's an unrelated `Host rileyhost` entry (different key, different box). F1's own commit needs no server
  access (it only writes `infra/ACCESS.md`, a `CLAUDE.md` section, and a `.gitignore` check) — but **F2's on-box
  diagnosis and F4's final staging verification both need the alias and `staging.env` to exist first**. F1's
  commit writes the human steps into `infra/ACCESS.md`; you'll need to run them before I can do anything past
  F1. I'll pause and ask once F1 is committed rather than guess at a workaround.
- `gitleaks` and `shellcheck` are both installed locally (`/opt/homebrew/bin/`), so F1's and the acceptance
  criteria's tool checks run without needing the box.
- `apps/web/Dockerfile` already has `ARG COMMIT_SHA=unknown` / `ENV COMMIT_SHA=$COMMIT_SHA` in both `builder` and
  `runner` stages; `infra/docker-compose.yml`'s `web.build.args` sets `COMMIT_SHA: ${COMMIT_SHA:-${SOURCE_COMMIT:-unknown}}`.
  This is exactly the pattern the epic says Coolify locks into `unknown` — confirmed by reading the file, not
  guessed, but *why* Coolify locks it (vs. some other build-arg path) still needs the on-box confirmation F2 asks
  for before I touch these files.
- `infra/bootstrap.sh` already has: the `PermitRootLogin prohibit-password` comment block explaining Coolify's
  root-by-key SSH, and `fail2ban`'s `ignoreip` covering `10.0.0.0/8`/`172.16.0.0/12` — both landed in the three
  `fix(infra)` commits already on `main` (`4259723`, `df4ef91`, `fd7b57d`), ahead of this follow-up epic being
  written. What's **not** yet there: an inline comment on the `systemctl reload-or-restart ssh || systemctl
  restart ssh.socket` line explaining the `ssh.service`/`sshd.service` naming split on Ubuntu 24.04 (the fallback
  exists in code; the *why* comment doesn't). I'll add that one comment in F3, and re-verify against the file at
  implementation time rather than assume nothing else changed.
- `infra/RUNBOOK.md`'s "Rotate a secret" section already has the `ALTER USER` command for a live DB; it's missing
  the drop-the-volume alternative for a still-empty DB, and there's no password-generation guidance anywhere
  (`.env.example` just says `POSTGRES_PASSWORD=change-me`). No "web container restart loop" section exists yet.
- `infra/README.md` step 6 still has the ⚠ (unconfirmed GitHub App screen name), step 8 still has the "not yet
  confirmed" Base Directory caveat, step 9 lists the full `.env.example` var set (not the narrowed one F3 asks
  for), and there's no www-router / Direction-setting note. Step 5's Coolify-UI-via-tunnel-only description
  predates the `coolify.41prompts.ai` Instance Domain F3 describes.
- `apps/web/app/healthz/route.ts` returns `commit: process.env.COMMIT_SHA ?? "unknown"` already — no change
  needed there for F2; the fix is entirely in how `COMMIT_SHA` gets set at build time.

---

## F1 · Server access policy (commit 1)

**Files:**

| File | Change |
|---|---|
| `docs/decisions/ADR-001-stack-and-structure.md` | Already-edited Revisions block — commit as-is (see §0). |
| `docs/epics/CURRENT.md`, `docs/epics/EPIC-001-infrastructure.md` | Already-edited strikethroughs + Follow-up section — commit as-is (see §0). |
| `infra/ACCESS.md` **(new)** | Who may connect, how, the six rules verbatim from `CURRENT.md`'s F1, and the human setup steps (SSH config entry, Coolify API token, `staging.env`). |
| `CLAUDE.md` **(modified)** | New **Server access** section, the same six rules, verbatim. |
| `infra/README.md` **(modified)** | One-line link to `infra/ACCESS.md` near the top, next to the existing "Before you start" paragraph. |
| `.gitignore` **(modified)** | Add explicit `infra/*.env` and `.41prompts/` entries alongside the existing blanket `.env`/`.env.*`/`!.env.example` rules — belt-and-suspenders per the epic's literal ask, even though the blanket rule already covers `infra/*.env`. |

**Verification:** `gitleaks detect --source .` (repeat after committing); `git status` shows no `*.env` file ever
staged.

**No server access needed for this commit.**

---

## F2 · `commit` is `unknown` on staging (commit 2)

**Blocked on F1's human steps being done** (§0). Once `41p-box` and `staging.env` exist:

1. **Diagnose, read-only, per `infra/ACCESS.md` rule 2** (no approval needed — all read-only):
   - `ssh 41p-box docker ps` → find the running `web` container/image.
   - `ssh 41p-box docker inspect <web-container> --format '{{json .Config.Env}}'` and
     `docker history --no-trunc <web-image>` → see whether `SOURCE_COMMIT` (or another name) is actually baked in
     as a build arg, and at what layer.
   - `cat` (read-only, explicitly allowed) whatever Coolify keeps under
     `/data/coolify/applications/<app-uuid>/` — the deploy log's own wording ("Added 28 ARG declarations to
     Dockerfile for service web") suggests Coolify rewrites/wraps the Dockerfile before building; if that
     generated file is on disk, read it directly instead of inferring from the log line alone.
   - `GET` the Coolify API for the application's build/env settings if the UI/CLI paths above don't fully explain
     it.
2. **Expected outcome** (per the epic's own hint, to be confirmed not assumed): Coolify injects `SOURCE_COMMIT`
   as a Dockerfile `ARG` automatically for every git-based build, independent of anything in
   `infra/docker-compose.yml`'s `args:` block. If so:
   - `infra/docker-compose.yml`: remove the `web.build.args` block entirely (the `${COMMIT_SHA...}`/
     `${SOURCE_COMMIT...}` interpolation in that YAML is exactly what makes Coolify create the two locked,
     undeleteable env vars — removing the *text*, not just the value, is what the epic asks for).
   - `apps/web/Dockerfile`: change `ARG COMMIT_SHA=unknown` → `ARG SOURCE_COMMIT=unknown` and
     `ENV COMMIT_SHA=$COMMIT_SHA` → `ENV COMMIT_SHA=$SOURCE_COMMIT`, in both the `builder` and `runner` stages
     (mirrors what's already there, just renamed to match what Coolify actually sets).
   - Local `docker compose build` keeps working via an explicit CLI flag, not a compose-file reference (a
     compose-file reference would reintroduce the same `${...}` text Coolify chokes on):
     `docker compose --project-directory . -f infra/docker-compose.yml build --build-arg SOURCE_COMMIT=$(git rev-parse HEAD) web`
     — documented in `infra/README.md`'s local-dev note and in the plan's verification section.
3. **If diagnosis shows Coolify injects nothing usable**, fall back to the epic's second option: allow
   `.git/HEAD` and `.git/refs` through `.dockerignore` for the `pruner` stage only, read the sha from there in a
   `RUN` step, and drop the `ARG`-based approach. I'll pick whichever the on-box evidence actually supports and
   say which, and why, in the commit message — not both.
4. **`infra/README.md`:** rewrite step 10 (currently "nothing to configure for `COMMIT_SHA`") to match whichever
   mechanism won, and add the post-merge step: once this change is deployed, Soroush deletes the two now-orphaned
   locked variables (`SOURCE_COMMIT`, `COMMIT_SHA`) in the Coolify UI's Environment Variables tab.

**This commit's own acceptance (`curl .../healthz` == `git rev-parse origin/main`) is only checkable after F4's
merge and redeploy** — logged there, not here, per the epic's own F4 wording ("verify F2's acceptance on the
deployed result before closing").

---

## F3 · Runbook corrections (commit 3)

No server access needed — these are documentation/comment fixes for facts already established by what Soroush
saw while following the runbook (per the epic text itself, e.g. "verified against the UI").

| File | Change |
|---|---|
| `infra/README.md` step 9 (Environment Variables) | Add: generate `POSTGRES_PASSWORD` with `openssl rand -hex 24`, not `-base64` (`/` and `+` in base64 output break `DATABASE_URL` as a URL; `drizzle-kit migrate` then fails with a bare `Exit status 1`). |
| `infra/RUNBOOK.md` "Rotate a secret" | Add the drop-the-volume alternative next to the existing `ALTER USER` command, for when the DB is still empty: locate the project-prefixed `postgres_data` volume (`docker volume ls \| grep postgres_data`) and `docker volume rm <name>` — only ever on a disposable/empty DB, never on one with real data. |
| `infra/README.md` steps 5–6 | Rewrite: Coolify UI is reached at `https://coolify.41prompts.ai` (Instance Domain, its own proxy, 2FA) as primary; the SSH tunnel becomes the fallback; port 8000 stays closed either way. Step 6 becomes **Sources → + Add → GitHub App**, ⚠ removed, with the note that it needs the public HTTPS instance domain set first or the OAuth callback fails. |
| `infra/README.md` step 8 | Remove the "not yet confirmed" caveat sentence (Base Directory `/` + Compose Location `/infra/docker-compose.yml` is now confirmed working); add that Coolify writes `.env` at the base directory from its own Environment Variables tab. |
| `infra/README.md` step 9 | Narrow the required-now variable list to `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DEPLOY_ENV`; note that auth/provider/R2 keys arrive with the epics that need them (R2 already has its own step 12 later in this same file); warn explicitly that Coolify auto-creates a locked variable for every `${VAR}` it finds in the compose file — this is the same mechanism F2 works around. |
| `infra/README.md` Domains section | Document Coolify's "Direction" setting adding a `www.` router that fails ACME renewal every few minutes with no `www` DNS record (seen in `coolify-proxy` logs for `www.staging.41prompts.ai`); state the setting to disable it. |
| `infra/bootstrap.sh` | Add one inline comment above `systemctl reload-or-restart ssh \|\| systemctl restart ssh.socket` explaining the `ssh.service`/`sshd.service` split on socket-activated Ubuntu 24.04 — the fallback already exists, the comment doesn't. Re-check the rest of the file at implementation time in case anything else from F3's bullet list is still missing. |
| `infra/RUNBOOK.md` | New "Web container restart loop" section: diagnostics `docker ps -a` and `docker logs --tail 40 <container>`, and the two causes actually seen (bad password characters breaking `DATABASE_URL`, migration failure). |

**Verification:** `shellcheck infra/*.sh` clean; proofread the rewritten `infra/README.md` steps against the exact
wording `CURRENT.md`'s F3 gives (it's largely dictation, not invention).

---

## F4 · Report and session (commit 4)

| File | Change |
|---|---|
| `docs/epics/reports/EPIC-001-report.md` | Append a "Follow-up (2026-09-04)" section: human-half evidence (healthz output with commit, container status table, proxy log line for the cert), what F1–F3 changed, open items still owed by Soroush (production environment + `v0.0.1-test`, R2 bucket + backup evidence, restore drill time, kill-container test). |
| `docs/epics/sessions/EPIC-001-session.md` | Append this session: prompt sent, plan summary, every server command run and its approval (per F1 rule 5 and your instruction), decisions made and why, what took longer than expected, verification tail, open questions. |

Then: push `epic/001-followup`, open a PR to `main` (`gh pr create`), wait for CI green, and **pause for your
explicit go-ahead before squash-merging** — merging triggers staging's auto-deploy, which is the shared-state
action worth a checkpoint even under the standing instruction to execute F1→F4. After merge, verify F2's
acceptance criterion (`curl -s https://staging.41prompts.ai/healthz` vs. `git rev-parse origin/main`) on the
deployed result before calling this closed.

---

## Open dependency, restated

**F1's own commit needs nothing from you.** Before I can do F2 (on-box diagnosis) or the final leg of F4 (staging
verification), you need to complete `infra/ACCESS.md`'s human steps: `~/.ssh/config` entry `Host 41p-box`, a
narrow-permission Coolify API token, and `~/.41prompts/staging.env` (mode 600) with `COOLIFY_URL` /
`COOLIFY_API_TOKEN`. I'll write the exact steps into `infra/ACCESS.md` as part of F1 and stop there to let you do
them before I continue to F2.
