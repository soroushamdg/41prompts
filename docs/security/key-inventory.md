<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Key inventory

Every credential-bearing environment variable this system configures or reads, where it lives, who
can rotate it, and when it last was. Written for EPIC-901, 2026-09-18.

**This file is read by a test.** `scripts/audit.mjs`'s `key-inventory` check scans the tree for
environment variables whose names carry a credential and compares them with the **Name** column
below, **in both directions**: a variable the code uses and this file does not list fails the audit,
and a row here that nothing uses fails it too. A one-way check would let the inventory rot into a
list of things that used to exist, which is worse than no inventory because it reads as current.

**Nothing in this file is a secret.** It is a list of *names*, not values. No value from any of
these belongs in this repository, in a commit message, or in a transcript — `CLAUDE.md`'s server
access rule 7.

## Rotating one

**Every row here is Soroush's to rotate.** An unattended run may not: `docs/AUTONOMOUS.md` puts
production and its environment variables out of reach entirely, and on 2026-09-13 eleven production
environment variables were overwritten in one paste, which is the failure that rule exists to stop.

The general procedure, which each row narrows:

1. Mint the new value in the provider's own console.
2. Set it in **Coolify**, for the one environment being rotated — staging and production are
   separate applications with separate variable sets and are never rotated in the same action.
3. Redeploy that application. A variable Coolify holds does not reach a running container.
4. Revoke the old value in the provider's console, **after** the redeploy is serving.
5. Update the **Last rotated** cell below in the same commit.

`BETTER_AUTH_SECRET` is the one that is not like the others: rotating it invalidates every live
session, because it is the key those sessions are signed with. That is not a reason to avoid it —
it is a reason to do it deliberately rather than as part of a batch.

## Where a value can live

| store | what is in it | who reaches it |
|---|---|---|
| **Coolify**, per application | every runtime variable for staging and for production | Soroush, through the Coolify UI or a non-`GET` API call, which `CLAUDE.md` rule 3 makes one command, one yes |
| **GitHub Actions secrets** | `COOLIFY_URL`, `COOLIFY_DEPLOY_TOKEN`, `COOLIFY_STAGING_UUID`, `COOLIFY_PRODUCTION_UUID`, and the automatic `GITHUB_TOKEN` | the repository's workflows |
| **`~/.41prompts/staging.env`**, mode 600 | `COOLIFY_URL`, `COOLIFY_API_TOKEN` | Soroush's machine only. `CLAUDE.md` rule 1: never read, never copied, never printed |
| **the developer's `.env`** | local placeholders, never a real value for anything live | whoever checked the repository out |
| **`.env.example`** | the names and their documentation. **Values are placeholders and always have been** | everyone; it is committed |

## The inventory

**Last rotated is `never recorded` for every row, and that is a finding rather than a formatting
choice.** No rotation has been performed or logged since the project began on 2026-08-26, and
nothing in the repository recorded when a value was first set. The column starts being useful at the
first rotation; until then it says what is true.

| Name | What it opens | Lives in | Rotate | Last rotated |
|---|---|---|---|---|
| `BETTER_AUTH_SECRET` | signs and encrypts every session cookie | Coolify ×2, local `.env`, CI literal (placeholder) | invalidates all live sessions; do it alone | never recorded |
| `DATABASE_URL` | the Postgres database, and it **embeds `POSTGRES_PASSWORD`** | Coolify ×2, local `.env`, CI service | changing the password changes this string; both move together | never recorded |
| `POSTGRES_PASSWORD` | the Postgres superuser | Coolify ×2, local `.env`, CI service literal | with `DATABASE_URL`, in the same action | never recorded |
| `KEY_ENCRYPTION_SECRET` | the secret half of the sealed box over **every customer's stored provider key** | Coolify, worker only | **re-encrypts nothing** — rotating it without a migration makes every stored key unreadable. See `docs/security/byo-key-threat-model.md` | never recorded |
| `KEY_ENCRYPTION_PUBLIC_KEY` | the public half; seals, never opens | Coolify, web only | pairs with the row above; not a secret, and `CLAUDE.md` explains why the split exists (threat model row `043a`) | never recorded |
| `ANTHROPIC_API_KEY` | our Anthropic account, billed | Coolify, worker | Anthropic console; revoke after redeploy | never recorded |
| `OPENAI_API_KEY` | our OpenAI account, billed | Coolify, worker | OpenAI console | never recorded |
| `GOOGLE_API_KEY` | our Google AI account, billed | Coolify, worker | Google AI Studio | never recorded |
| `GOOGLE_CLIENT_SECRET` | the Google OAuth app — **one app per environment, never shared** | Coolify ×2 | Google Cloud console; `infra/README.md` has the callback URLs | never recorded |
| `GITHUB_CLIENT_SECRET` | the GitHub OAuth app, same one-per-environment rule | Coolify ×2 | GitHub developer settings | never recorded |
| `RESEND_API_KEY` | sending mail as us. Unset locally, where sending silently no-ops | Coolify ×2 | Resend dashboard | never recorded |
| `R2_ACCESS_KEY_ID` | the identifier half of the R2 credential pair | Coolify ×2, `infra/backup.sh` | Cloudflare R2 issues both halves together | never recorded |
| `R2_SECRET_ACCESS_KEY` | **the database backups and the published artifacts**, read and write | Coolify ×2, `infra/backup.sh` | with the row above; see `infra/RUNBOOK.md` before revoking, the backup loop uses it | never recorded |
| `AWS_ACCESS_KEY_ID` | **not a separate credential** — `infra/restore.sh` exports `R2_ACCESS_KEY_ID` under the name the `aws` CLI reads | nothing stores it | rotate the R2 pair | n/a |
| `AWS_SECRET_ACCESS_KEY` | **not a separate credential** — the same alias for `R2_SECRET_ACCESS_KEY` | nothing stores it | rotate the R2 pair | n/a |
| `SENTRY_DSN` | posting events to our Sentry project. Semi-public by design: it is in the client bundle | Coolify ×2 | Sentry project settings | never recorded |
| `NEXT_PUBLIC_SENTRY_DSN` | the same value, in the browser. **Public by design** — a `NEXT_PUBLIC_` name is compiled into the bundle every visitor downloads | Coolify ×2 | with the row above | never recorded |
| `SENTRY_AUTH_TOKEN` | uploading source maps at build time. **Not public**, despite sitting beside two that are | Coolify ×2, build only | Sentry auth tokens, scope `project:releases` | never recorded |
| `NEXT_PUBLIC_POSTHOG_KEY` | the PostHog project's ingestion key. **Public by design** | Coolify ×2 | PostHog project settings | never recorded |
| `TURNSTILE_SECRET_KEY` | verifying a Turnstile token server-side | Coolify ×2 | Cloudflare Turnstile | never recorded |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the widget's site key. **Public by design** | Coolify ×2 | with the row above | never recorded |
| `COOLIFY_DEPLOY_TOKEN` | triggering a deploy of either application | GitHub Actions secrets | Coolify → API tokens | never recorded |
| `GITHUB_TOKEN` | the workflow's own scoped token | **minted per run by GitHub**; nothing stores it | nothing to rotate | n/a |
| `GH_TOKEN` | `gh` inside a workflow; set from `GITHUB_TOKEN` | nothing stores it | nothing to rotate | n/a |
| `FORTYONE_API_KEY` | **a customer's key, in a customer's process** — `@41prompts/sdk` and `fortyone` fall back to it when `apiKey` is not passed to `createClient`. We never hold a value | the customer's environment | the customer rotates it, from the API keys tab | n/a |

## Not in the table, and why

`COOLIFY_API_TOKEN` lives in `~/.41prompts/staging.env` on Soroush's machine and is **deliberately
not** an environment variable of any application. `CLAUDE.md` server-access rule 1 forbids reading,
copying or printing it, and `infra/setup-access.sh` only ever writes it. It is a credential this
project holds and the row for it is here, in prose, rather than in a table a scanner walks — because
nothing in the tree reads it as an environment variable and a row that nothing uses would fail the
audit's second direction.

Rotating it: Coolify → **Keys & Tokens → API tokens**, issue a new one, re-run
`infra/setup-access.sh`, revoke the old one. Nothing deploys and no application restarts.

## What this inventory does not cover

- **Values.** By design, and permanently.
- **Whether a value in Coolify is the same as the one in the provider's console.** Nothing in this
  repository can see either. A rotation that half-happened — new value minted, Coolify not updated —
  looks identical from here to one that did not happen at all.
- **The database's own contents.** Customer provider keys are sealed inside it under
  `KEY_ENCRYPTION_SECRET`; `docs/security/byo-key-threat-model.md` is the document for those.
- **Anything about the last rotation date being true.** It is a cell a person updates. The audit
  checks that the row exists, not that the date is honest.
