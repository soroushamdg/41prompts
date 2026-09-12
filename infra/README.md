# Infrastructure setup

One-time setup for the Lightsail box that runs Coolify, which deploys `apps/web`, `apps/worker`, and `postgres`
from this repo. Written for doing this the first time. Claude Code writes and maintains everything under
`infra/`; every step below that touches the server, DNS, or a secret is yours to run.

Before you start: an AWS account with Lightsail access, a Cloudflare (or other) DNS zone for `41prompts.ai`, and
a Cloudflare account for R2. Nothing here needs a GitHub personal access token — Coolify connects to GitHub via
its own GitHub App (step 6).

Claude Code may now reach this box directly over SSH and the Coolify API — see `infra/ACCESS.md` for who may
connect, how, and the rules that apply every time.

## Steps

1. **AWS Console → Lightsail → Create instance.** **The region selector is top-right in the Lightsail console
   and defaults to N. Virginia — confirm it says Canada (Central) / ca-central-1 before clicking Create; its
   default key pair is a different file from the N. Virginia (us-east-1) one.** Region **Montréal
   (ca-central-1)**, platform Linux/Unix, blueprint **OS Only → Ubuntu 24.04 LTS**, plan **4 GB RAM / 2 vCPU /
   80 GB SSD** or larger. On the instance's **Networking** tab: attach a **static IP**. On **Snapshots**: enable
   **automatic daily snapshots**. Download the region's default SSH key pair during creation and store it in
   `~/.ssh/lightsail/`, never inside the repo.
2. **Networking tab, firewall rules:** allow only **22 (SSH)**, **80 (HTTP)**, **443 (HTTPS)**. Do not open 8000
   (Coolify's own UI) — port 8000 stays closed permanently; step 5 covers how the UI is actually reached.
3. **DNS** (registrar or Cloudflare): `A` records for `41prompts.ai`, `app.41prompts.ai`, `staging.41prompts.ai`
   → the static IP from step 1. If using Cloudflare: proxy **off** (grey cloud) until Coolify issues TLS in step
   11, then switch it **on**.
4. **From your terminal**, run the bootstrap once:
   ```
   ssh -i ~/.ssh/lightsail/<key>.pem ubuntu@<static-ip> 'sudo bash -s' < infra/bootstrap.sh
   ```
   It's idempotent — safe to re-run if interrupted. It hardens the `ubuntu` user (key-only SSH, no root login),
   sets up `ufw`/`fail2ban`/unattended upgrades, adds a 2 GB swap file, installs Docker, then installs Coolify.
   It prints the Coolify URL (`http://localhost:8000`, only reachable from the box itself) when done.
5. **First time only — open a tunnel to reach Coolify's setup wizard** (no domain is configured yet, so this is
   the only way in):
   ```
   ssh -i <lightsail-key> -L 8000:localhost:8000 ubuntu@<static-ip>
   ```
   Open `http://localhost:8000` in your browser and create the **admin account** (first screen the wizard shows).
   Coolify's own default local server should already be registered as the deploy target, since Coolify runs on
   the same box it deploys to — if the wizard instead prompts you to add a server, confirm it's adding
   `localhost`/`127.0.0.1`, not a new remote host. Once the admin account exists, set Coolify's **Instance
   Domain** to `coolify.41prompts.ai` (DNS record from step 3) so the UI is reachable at
   **`https://coolify.41prompts.ai`** through Coolify's own proxy from then on, behind 2FA. Port 8000 stays
   closed permanently (step 2); the tunnel above is the fallback for whenever the instance domain or proxy itself
   is unreachable, not the normal path.
6. **Sources → + Add → GitHub App** (needs the public HTTPS instance domain from step 5 set first, or the GitHub
   OAuth callback fails) — this is where a Coolify-managed GitHub App is installed against
   `soroushamdg/41prompts` so Coolify can pull the repo and post deploy-status checks on commits. **As of
   EPIC-008 (2026-09-04), this is only used to read the compose file's content on deploy — Coolify never builds
   an image from this checkout.** Both images are built in GitHub Actions and pushed to GHCR (step 6.5 below);
   Coolify only pulls the fixed tag `docker-compose.staging.yml`/`docker-compose.production.yml` point at. The
   "Prebuilt images (EPIC-008)" section at the end of this file turns off this App's own auto-deploy-on-push
   behavior, since that would otherwise redeploy the *previous* image tag the instant a push lands, before
   Actions has finished building the new one.
7. **Projects → New Project**, name it `41prompts`. Inside it, create two **Environments**: `staging` and
   `production`. **Both track branch `main`** — Coolify's UI has no way to have a resource track a tag instead
   of a branch (confirmed against a real deploy attempt, see `docs/epics/reports/EPIC-001-report.md`'s
   "Production tag-deploy criterion outcome"), so both environments read `main`'s copy of the compose file for
   its *content* only. Which environment actually gets deployed, and with which image tag, is decided entirely
   by GitHub Actions (`.github/workflows/build-images.yml`) calling that environment's deploy webhook — see the
   "Prebuilt images (EPIC-008)" section at the end of this file. This also means step 8's "auto-deploy on push"
   must be turned off for both (same section) — otherwise Coolify redeploys on every push to `main` using
   whatever image tag was already pulled last time, before Actions has built the new one.
8. In each environment: **New Resource → Docker Compose**, point it at the connected repo. **Important:** set
   **Base Directory** to `/` (the repo root) and **Docker Compose Location** to `/infra/docker-compose.yml` for
   now — the "Prebuilt images (EPIC-008)" section repoints this to the per-environment file once those exist on
   `main`. Docker Compose resolves the compose file's relative paths (`build.context`,
   `env_file`) and its default `.env` lookup relative to whatever it treats as the project directory, which
   defaults to the *compose file's own directory* unless told otherwise. Since `infra/docker-compose.yml` needs
   the repo root as both its build context (the Dockerfiles run `turbo prune` over the whole monorepo) and where
   `.env` lives, Coolify's Base Directory has to be the repo root for its deploy to work at all — confirmed both
   locally (`docker compose --project-directory . -f infra/docker-compose.yml config`, see
   `docs/epics/reports/EPIC-001-report.md`) and against a real Coolify deploy: this setting does produce the
   equivalent of `--project-directory`. Coolify writes an `.env` file at the Base Directory itself, generated from
   this resource's Environment Variables tab (step 9) — you never create or edit that file by hand.
9. **Environment Variables** tab on the resource: only what the compose file actually needs to bring `postgres`,
   `web`, and `worker` up is required at this point — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and
   `DEPLOY_ENV` (`staging` or `production` to match the environment). Auth/provider keys and `R2_*` arrive with
   the epics that need them; `R2_*` specifically has its own step later (step 12). **Generate
   `POSTGRES_PASSWORD` with `openssl rand -hex 24`, not `-base64`** — see `infra/RUNBOOK.md`'s "Generating or
   rotating `POSTGRES_PASSWORD`" for why, and for what to do if you need to change it after the first start.
   **Warning:** Coolify auto-creates a locked, permanent environment variable for *every* `${VAR}` it finds
   anywhere in `infra/docker-compose.yml`, regardless of section — this is exactly the mechanism behind the
   `commit: unknown` defect fixed in Follow-up F2 (`infra/README.md` step 10), so don't add a variable here by
   editing the compose file to reference it unless you mean to lock it permanently.
10. Nothing to configure for `COMMIT_SHA` going forward — but if this application was created before the
    Follow-up F2 fix, it likely still carries two **locked** Environment Variables named `SOURCE_COMMIT` and
    `COMMIT_SHA`, both stuck at the literal value `unknown`. Diagnosis (read from Coolify's own source on the box,
    `app/Jobs/ApplicationDeploymentJob.php`): any `${VAR}` written anywhere in `infra/docker-compose.yml` —
    `build.args` included — gets parsed by Coolify into a permanent application environment variable defaulting to
    that `${VAR:-fallback}` expression's fallback. Once such a variable exists, Coolify feeds *its stored value*
    back into the build as that build arg on every deploy, permanently pinning it, regardless of what the compose
    file's fallback logic would otherwise resolve to. Coolify does still auto-inject a real `SOURCE_COMMIT`
    directly onto the **running container** at deploy time (not the build) whenever no such variable exists —
    `apps/web/app/healthz/route.ts` reads that as a fallback if `COMMIT_SHA` comes back `unknown`. If this
    application predates the fix, clean it up once, in order — **do not consider `commit: unknown` fixed until
    step (e) below**:
    - (a) Merge the Follow-up F2 change (removes every `${COMMIT_SHA...}`/`${SOURCE_COMMIT...}` reference from
      `infra/docker-compose.yml`).
    - (b) Staging auto-deploys on the merge. `commit` may still read `unknown` right after this — the locked
      `SOURCE_COMMIT=unknown` variable still exists at this point; that's expected, not a failure.
    - (c) In the resource's **Environment Variables** tab, delete `SOURCE_COMMIT` and `COMMIT_SHA` — now deletable
      because the compose file no longer references either.
    - (d) Press **Redeploy**.
    - (e) `curl -s https://staging.41prompts.ai/healthz` now equals `git rev-parse origin/main`.
11. **Domains** tab, `web` service only: set `staging.41prompts.ai` (staging environment) and
    `app.41prompts.ai` (production environment). Leave `worker`, `postgres`, and `backup` without a domain —
    they're not web-facing. Let Coolify issue TLS (Let's Encrypt) once DNS resolves. **Set Direction to
    non-www** (API field `redirect`, valid values `www` / `non-www` / `both` — confirmed by reading
    `app/Models/Application.php` on the box; our staging resource was found set to `both`). With no
    `www.staging.41prompts.ai` DNS record, `both` makes Coolify's Traefik also configure a router for that
    hostname, whose ACME certificate renewal then fails every few minutes — visible as repeated errors for
    `www.staging.41prompts.ai` in `coolify-proxy`'s logs (`ssh 41p-box docker logs coolify-proxy`, read-only).
    Setting Direction to non-www removes that router entirely.
12. Create the R2 bucket `41p-backups` and an R2 API token (Cloudflare dashboard → R2 → Manage API tokens), then
    set `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` in step 9's Environment Variables.
13. Nothing to configure for backups either: `infra/docker-compose.yml` includes a `backup` service that runs
    `infra/backup.sh` on its own nightly schedule (03:00 UTC) inside a small container, rather than relying on a
    Coolify Scheduled Task — see the comment above the `backup` service in that file for why. Once step 9's R2
    variables are set, it works without further setup. Confirm it after the first deploy:
    `docker compose -f infra/docker-compose.yml logs backup` should show `[backup] scheduler started`.
14. Push to `main`; confirm `build-images.yml` runs green in GitHub Actions, then that the staging deploy follows
    and `curl https://staging.41prompts.ai/healthz` returns the current commit's sha (do this after the
    "Prebuilt images (EPIC-008)" section — before it, this file has no `web`/`worker` images to pull yet). Push a
    `v0.0.1-test` tag; confirm the production deploy and `curl https://app.41prompts.ai/healthz`.
15. Follow `infra/RUNBOOK.md`'s restore drill once, end to end, and record the time in that file.
16. Read this file top to bottom once, start to finish, exactly as written, and confirm every step above matched
    what the Coolify UI actually showed. Fix anything that drifted — this file only stays useful if it matches
    reality the next time someone (including future-you) runs it.

## Prebuilt images (EPIC-008, 2026-09-04)

Do this once, in order, before the first push to `main` after EPIC-008 merges — it moves image building off the
box entirely. `.github/workflows/build-images.yml` builds `web` and `worker`, pushes both to private GHCR, and
calls Coolify's deploy webhook; Coolify's job shrinks to "pull this tag and restart."

1. **GitHub → repo → Settings → Secrets and variables → Actions → New repository secret.** Add four:
   - `COOLIFY_URL` — same value as `~/.41prompts/staging.env`'s `COOLIFY_URL` (`https://coolify.41prompts.ai`).
   - `COOLIFY_DEPLOY_TOKEN` — a **new** token, narrowest scope Coolify's UI offers that includes deploy (never
     reuse the read-only token from `~/.41prompts/staging.env`). Create it: **Coolify UI → Keys & Tokens → API
     tokens → Create**.
   - `COOLIFY_STAGING_UUID` — `pboa5wxrnggay30epiq0pmzd` (the staging application's uuid; read via a `GET` to
     `/api/v1/applications`, not secret in itself, but stored as a secret here per the epic's decision so the
     workflow file names no environment-specific identifiers at all).
   - `COOLIFY_PRODUCTION_UUID` — `d180rye1i9dtab789t9jyjmh` (same, for the production application).
2. **Turn off Coolify's own auto-deploy, on both applications** (otherwise the instant this PR's merge to `main`
   lands, Coolify redeploys the *old* `docker-compose.yml`-based build before Actions has even started — or,
   once step 4 below repoints it, redeploys the previous image tag before the new one exists): open each
   application → **Advanced** tab → **Deployment** section → **Auto deploy** listbox → **"Manual deployments
   only"** (saves instantly, no separate save button). Do this for the staging application and the production
   application both.
3. **One-time GHCR registry auth on the box.** Coolify 4.3.17 has no private-registry credential store to
   configure through its UI (confirmed by reading `ApplicationDeploymentJob.php` on the box — it throws "Please
   run docker login to login to the docker registry on the server" when a pull needs auth it doesn't have; the
   only registry-shaped fields on `Application`, `docker_registry_image_name`/`docker_registry_image_tag`, belong
   to a different application type — "deploy a prebuilt image, no git repo" — not to a docker-compose resource
   like ours). So: on GitHub, create a **classic PAT** scoped **`read:packages`** only (**GitHub → Settings →
   Developer settings → Personal access tokens → Tokens (classic) → Generate new token**). Then, **run this
   yourself, directly over SSH** (don't paste the PAT into a Claude Code session — it would sit in the
   transcript needlessly):
   ```
   ssh 41p-box
   echo '<the PAT>' | sudo docker login ghcr.io -u soroushamdg --password-stdin
   ```
   This writes root's `~/.docker/config.json` on the box once; `pull_policy: always` deploys need no further
   auth after that. Rotation: repeat this whenever the PAT is rotated or expires — see
   `infra/RUNBOOK.md`.
4. **Repoint each environment's Docker Compose Location** (only meaningful once `infra/docker-compose.staging.yml`
   / `infra/docker-compose.production.yml` exist on `main`, i.e. after this PR merges): open each application →
   **General** tab → **Docker Compose Location** → change from `/infra/docker-compose.yml` to
   `/infra/docker-compose.staging.yml` (staging application) or `/infra/docker-compose.production.yml`
   (production application). Base Directory stays `/` on both.
5. First deploy after all four steps above: either push a trivial commit to `main` (triggers
   `build-images.yml` → GHCR push → Coolify webhook), or manually press **Redeploy** on the staging resource once
   step 4's file exists there. Confirm `curl -s https://staging.41prompts.ai/healthz` returns the pushed commit's
   sha, then confirm `docker images` timestamps on the box (or the Coolify deployment log) show a pull, not a
   build.

Rollback procedure and its timed run are in `infra/RUNBOOK.md`'s "Roll back a deploy" section.

## Auth secrets (EPIC-002, 2026-09-05)

Six secrets plus one non-secret, environment-specific URL, needed once before staging/production
sign-in works. All of them arrive the same way every other secret has (step 9): **Coolify UI →
that environment's application → Environment Variables tab** — never by editing
`infra/docker-compose.staging.yml`/`.production.yml` (see the `${...}` warning in step 9). Set
each one separately for the staging application and the production application; decision 8 is
explicit that staging and production never share an OAuth app, a secret, or a callback URL.

1. **`BETTER_AUTH_URL`** — not secret, but still only reaches the container through this same
   Environment Variables tab. Staging: `https://staging.41prompts.ai`. Production:
   `https://app.41prompts.ai`.
2. **`BETTER_AUTH_SECRET`** — generate a distinct value per environment:
   `openssl rand -base64 32`.
3. **Google OAuth** — two separate OAuth 2.0 Client IDs (Google Cloud Console → APIs & Services
   → Credentials → Create Credentials → OAuth client ID → Application type **Web
   application**), one per environment:
   - Authorized JavaScript origins: `https://staging.41prompts.ai` (staging) /
     `https://app.41prompts.ai` (production).
   - Authorized redirect URIs: `https://staging.41prompts.ai/api/auth/callback/google`
     (staging) / `https://app.41prompts.ai/api/auth/callback/google` (production) — confirmed
     against a real local sign-in, this is exactly the URL Better Auth's `signInSocial`
     constructs from `BETTER_AUTH_URL`, not a guess.
   - Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` per environment.
4. **GitHub OAuth** — two separate OAuth Apps (GitHub → Settings → Developer settings → OAuth
   Apps → New OAuth App), one per environment:
   - Homepage URL: same as `BETTER_AUTH_URL` for that environment.
   - Authorization callback URL: `https://staging.41prompts.ai/api/auth/callback/github`
     (staging) / `https://app.41prompts.ai/api/auth/callback/github` (production) — same
     confirmation as Google's above.
   - Set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` per environment.
5. **Resend** — one account covers both environments (it's an email-sending account, not a
   per-environment credential like the OAuth apps): create it, verify the `mail.41prompts.ai`
   sending domain (Resend's **Domains** tab, adding the SPF/DKIM DNS records it gives you), then
   create an API key and set `RESEND_API_KEY` in both environments' Environment Variables tabs.
   The sender address itself is `RESEND_FROM_ADDRESS` (EPIC-003), read at runtime by
   `apps/web/lib/email.ts` — never hard-coded, so the two environments can point at different
   senders without a code change:
   - **Production**: set `RESEND_FROM_ADDRESS=41Prompts <noreply@mail.41prompts.ai>` once the
     domain above is verified. Sending from an unverified domain silently fails or lands in spam.
   - **Staging**: leave `RESEND_FROM_ADDRESS` unset. The code falls back to Resend's shared
     sandbox address (`onboarding@resend.dev`), which only delivers to the Resend account's own
     verified email — fine for staging, where the Playwright magic-link test reads the token
     straight from the database and never needs a real inbox.

None of the four OAuth client-secret/API-key values above are ever pasted into a Claude Code
session or committed anywhere — Soroush sets all six directly in the Coolify UI.

## Capture secrets (EPIC-014, 2026-09-10)

**Three values, and the app works without all of them** — that is deliberate, so this checklist is
something to do once when convenient rather than a deployment blocker. Same route as every other
secret (step 9): **Coolify UI → that environment's application → Environment Variables tab**, set
separately for staging and production.

What happens if you skip each one is written next to it, because "required" and "nice to have" are
different kinds of task and a checklist that does not say which is which gets done in the wrong order.

1. **`IP_HASH_SALT`** — *do this one first.* Generate a distinct value per environment:
   `openssl rand -hex 32`.
   **Without it:** the app runs and no address is ever stored raw, but the salt is random per process,
   so hashes stop matching across a restart and per-IP abuse accounting resets with every deploy. The
   worker logs a warning on every start while it is missing.
   **Why per environment:** so a staging table is not a lookup table for production.

2. **`TURNSTILE_SECRET_KEY`** and **`NEXT_PUBLIC_TURNSTILE_SITE_KEY`** — copy both names from
   `.env.example` rather than typing them; the `NEXT_PUBLIC_` prefix is part of the name, and it is
   **both or neither** (one alone turns Turnstile off and logs an error). One Cloudflare Turnstile
   widget per environment (Cloudflare dashboard → Turnstile → Add widget). Hostnames:
   `staging.41prompts.ai` for staging, `41prompts.ai` for production. Widget mode **Managed**.
   **Without them:** the widget is not rendered and verification is skipped, so permalink creation is
   guarded by the rate limit alone (20 shared links an hour per address). That is a real guard, just a
   weaker one — fine for a soft launch, worth closing before EPIC-015 announces anything.
   **Note:** despite the `NEXT_PUBLIC_` prefix, this one is read at **runtime**, so a restart is
   enough and a rebuild is not needed. Two things have to hold for that, and both do: the code reads
   `process.env[SITE_KEY_ENV]` through a variable, which Next cannot inline the way it inlines a
   literal `process.env.NEXT_PUBLIC_X`; and `/decompile` is server-rendered on demand, not
   prerendered — `next build` lists every route as `ƒ (Dynamic)`. The value reaches the browser as a
   prop, not as a baked constant. (This paragraph said the opposite until 2026-09-11; it was written
   from the prefix rather than from the build output.)

Nothing else in this epic needs a human. The purge job, the rate limits, the abuse check and the
waitlist all run on what is already configured.

### Verifying afterwards

```
# the salt is in use: the worker stops warning about it
ssh 41p-box docker logs <worker container> --tail 50 | grep hash-identity   # expect no output

# Turnstile is live: the widget script is referenced on a result page
curl -s https://staging.41prompts.ai/decompile | grep -c challenges.cloudflare.com
```

## Observability secrets (EPIC-004, 2026-09-05)

Sentry, PostHog, and the uptime monitor all need real accounts Claude Code cannot create — every
value below is set the same way as "Auth secrets" above: **Coolify UI → that environment's
application → Environment Variables tab**, never in the repo. `.env.example` lists every name.

1. **Sentry** — two projects (one JavaScript/Next.js, one Node), so web and worker issues stay in
   separate issue streams:
   - Create the org if one doesn't exist yet, then **Projects → Create Project** twice: platform
     **Next.js** named `41prompts-web`, platform **Node.js** named `41prompts-worker`.
   - Each project's **Settings → Client Keys (DSN)** gives you its DSN. Set
     `NEXT_PUBLIC_SENTRY_DSN` (the web project's DSN) on the web application, `SENTRY_DSN` (the
     worker project's DSN) on the worker application — both staging and production, same values in
     both (one Sentry org, environment/release tags are what distinguish a staging issue from a
     production one, not separate projects per environment).
   - `SENTRY_ORG` (the org slug) and `SENTRY_PROJECT_WEB` (`41prompts-web`) — plain config, not
     secret, but still only ever set through the same Environment Variables tab. These drive
     source-map upload at build time, not runtime, so they only need to exist as **GitHub Actions
     repository variables/secrets** (Settings → Secrets and variables → Actions), not in Coolify.
   - `SENTRY_AUTH_TOKEN` — **Settings → Auth Tokens → Create New Token**, scope `project:releases`
     (the minimum the source-map upload plugin needs). GitHub Actions secret only, never in
     Coolify, never in the repo (`apps/web/next.config.ts`'s own comment on this).
2. **PostHog** — one project covers both environments (events carry their own environment
   distinction via `DEPLOY_ENV`-tagged properties if a later epic needs it, same reasoning as
   Sentry above not needing two):
   - Create the project (EU or US host — pick once; `NEXT_PUBLIC_POSTHOG_HOST` in `.env.example`
     defaults to US). **Project Settings → API Keys** gives the public **Project API Key** — set
     `NEXT_PUBLIC_POSTHOG_KEY` on the web application, both environments.
   - A **personal API key** (top-right account menu → **Personal API Keys** → scope it to
     `dashboard:write` and `insight:write` only) is separately needed, once, to run
     `scripts/create-posthog-dashboard.mjs` (below) — this one is never set in Coolify at all,
     it's passed on the command line the one time the script runs.
3. **Uptime monitor** — any provider whose free tier can alert a phone (SMS or a phone call, not
   just email/Slack) works; recorded here once chosen rather than prescribing one in advance.
   Configure two HTTPS checks, `https://app.41prompts.ai/healthz` and
   `https://staging.41prompts.ai/healthz`, both expecting `200` and a JSON body containing
   `"ok":true`. Add a phone-reachable alert contact. Trigger one real test alert (most providers
   have a "send test notification" button) and confirm it actually reaches the phone before
   considering this done — a monitor that's configured but never tested is a monitor you don't
   actually know works.

## PostHog dashboard (EPIC-004)

Once the personal API key from step 2 above exists, run once from the repo root:
```
POSTHOG_PERSONAL_API_KEY=<the key> \
POSTHOG_PROJECT_ID=<project id, from the project's Settings URL> \
POSTHOG_HOST=https://eu.posthog.com \
  node scripts/create-posthog-dashboard.mjs
```
**`POSTHOG_HOST` must match this project's actual region** (EU for the real `41prompts` project,
as of this writing — check which host the project's own UI URL uses, `eu.posthog.com` vs.
`us.posthog.com`; getting it wrong fails every request with an unhelpful 401, not a clear error,
which is exactly what happened the first time this was run for real). Note this is the app host
(`eu.posthog.com`), not the ingestion host client libraries use (`eu.i.posthog.com`,
`NEXT_PUBLIC_POSTHOG_HOST`'s value) — both happen to accept this script's API calls, but the app
host is the documented one.

Creates one dashboard, "41Prompts milestones," with one insight per milestone metric in
`docs/roadmap.md`'s table (M0–M7) — each shows zero until the product actually produces the events
it counts, which is expected and correct this early (verified against the real dashboard: each
insight's `?refresh=true` result genuinely computes to `count: 0`, not just "created without
erroring"). Re-running the script is safe: it looks up existing insights by name before creating a
duplicate.

## Two hosts, one deployment (2026-09-12)

`41prompts.ai` serves the public product; `app.41prompts.ai` serves everything behind a session. A
request for the wrong kind of path on either is **301**ed to the same path on the other, so a search
engine settles on one host per page. Canonical URLs and `sitemap.xml` name the apex only.

The rule lives in `apps/web/lib/site/hosts.ts` and nowhere else — the proxy redirects from it,
`robots.ts` disallows from it, and a test walks every route in `app/` to check each one is classified.

### ⚠️ The session cookie now spans the parent domain

To let the apex see a session created on `app.` — which is what makes the landing nav say "Go to
dashboard" without a flash — the session cookie carries `Domain=.41prompts.ai`.

**Every host under that domain receives it.** Today that is the apex, `app.`, and `staging.`. Any
subdomain added in future — a status page, a docs host, a marketing experiment, anything a third party
runs for us — can read a signed-in session cookie. **Adding a subdomain of `41prompts.ai` is now a
security decision.** If a host does not need the session, it should live somewhere else entirely.

The sharpest instance today: **staging is a subdomain of the production domain**, so a browser holding
a production session sends that cookie to `staging.41prompts.ai`. Staging cannot *use* it (different
database, different `BETTER_AUTH_SECRET`), but it receives it, and staging is the less-defended box.
Moving staging to its own registrable domain would remove that, and is worth doing before anything
sensitive is behind the session.

What did **not** change, which was worth checking rather than assuming: Better Auth 1.7.2 prefixes this
cookie `__Secure-`, never `__Host-` (`HOST_COOKIE_PREFIX` exists in its source and is never applied).
`__Secure-` permits a `Domain`, so **the prefix stays, the cookie name is unchanged, and `Secure`,
`HttpOnly` and `SameSite=Lax` are all untouched**. The only attribute added is `Domain`. Sign-out
expires the cookie with the same attributes, so it dies on every host at once.

### Coolify variables

**Production** (application `d180rye1…`):

| variable | value |
|---|---|
| `PUBLIC_SITE_URL` | `https://41prompts.ai` |
| `BETTER_AUTH_URL` | `https://app.41prompts.ai` |
| `SESSION_COOKIE_DOMAIN` | `.41prompts.ai` |

**Staging** (application `pboa5wxr…`):

| variable | value |
|---|---|
| `PUBLIC_SITE_URL` | `https://staging.41prompts.ai` |
| `BETTER_AUTH_URL` | `https://app-staging.41prompts.ai` |
| `SESSION_COOKIE_DOMAIN` | `.staging.41prompts.ai` |

Staging's cookie domain is deliberately **not** `.41prompts.ai`. Sharing it would put a staging session
cookie on the production hosts under the same name, and signing in on one would overwrite the other.

> `app-staging.41prompts.ai` rather than `app.staging.41prompts.ai`: Let's Encrypt issues for both, but
> a cookie scoped to `.staging.41prompts.ai` is only sent to hosts *under* `staging.41prompts.ai` —
> which `app-staging.41prompts.ai` is not. **If the apex-to-app session must work on staging too, use
> `app.staging.41prompts.ai` and add that DNS record instead.** Both are listed below; pick one.

### DNS

| record | type | value |
|---|---|---|
| `app.41prompts.ai` | A | `3.97.92.244` *(already exists)* |
| `41prompts.ai` | A | `3.97.92.244` *(already exists)* |
| `app.staging.41prompts.ai` | A | `3.97.92.244` **← add this one** |

Add the host to the staging application's domains in Coolify so Traefik routes it and issues a
certificate.

### OAuth callback URLs

Both providers need the **`app.` host**, because that is where `BETTER_AUTH_URL` points and therefore
where the callback lands. Add these; the existing ones can be removed once the new ones are confirmed.

**Google** (APIs & Services → Credentials → the OAuth 2.0 client → Authorised redirect URIs):

```
https://app.41prompts.ai/api/auth/callback/google
https://app.staging.41prompts.ai/api/auth/callback/google
```

**GitHub** (Settings → Developer settings → OAuth Apps → the app → Authorization callback URL):

```
https://app.41prompts.ai/api/auth/callback/github
```

> GitHub OAuth apps accept **one** callback URL each, so staging needs its own app — that is already
> how staging and production are separated today, and only the URL changes.

## Why some things are the way they are

- **`postgres`, `web`, and its published ports are bound to `127.0.0.1`, not the open internet.** `ufw` (step 4)
  only allows 22/80/443, but Docker's port publishing bypasses `ufw` by writing directly to iptables. Binding
  published ports to loopback keeps them usable locally (SSH tunnel + `curl localhost`, or `psql` from the box)
  without opening them publicly. Coolify's proxy reaches `web` over the compose network by service name, not
  through the published port, so this doesn't affect routing.
- **Root SSH login stays enabled by key only (never by password), and fail2ban ignores Docker's private
  ranges (`10.0.0.0/8`, `172.16.0.0/12`).** Coolify manages this host by SSHing in as root, from its own
  container on the Docker bridge network, using a key it generates at install — blocking root login outright
  or letting fail2ban ban Coolify's own container would lock it out of the box it's supposed to manage.
- **No separate `deploy` user.** The existing `ubuntu` user already has sudo and the launch SSH key; hardening
  it (key-only SSH, no root login) is one less user/key/permission set to get wrong than provisioning a new one.
- **The migrate-before-start entrypoint assumes a single `web` replica.** See `infra/RUNBOOK.md`'s note on
  migration concurrency before considering horizontal scale-out.
