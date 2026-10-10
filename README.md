# 41prompts

The workbench for the prompt layer. Paste or write a prompt, break it into typed bloks (context, constraint, example, expects), watch the compiled prompt update, copy it, run it once on any model you bring (a hosted provider with your own key, any OpenAI-compatible endpoint, or a model on your own machine), and keep every version.

One Next.js app serves two hosts:

| Host | Tree | What |
|---|---|---|
| `41prompts.ai` | `src/app/site` | Landing page, Terms, Privacy |
| `app.41prompts.ai` | `src/app/app` | Sign-in and the app |

`src/proxy.ts` picks the tree from the `Host` header. Unknown hosts (Vercel previews) get the landing page. The design reference lives in `docs/` (start with `docs/README.md`, `docs/FEATURES.md`, `docs/DESIGN.md`).

## Stack

Next.js 16 (App Router) · TypeScript · plain CSS (global layered primitives in `src/styles`, CSS modules per screen) · Motion for layout animations · Postgres on Neon with Drizzle · Better Auth (email link via Resend, Google, GitHub) · Vercel AI SDK (20+ providers and any OpenAI-compatible endpoint, on each user's own key) · Stripe Checkout with Managed Payments · PostHog (cookieless) · Sentry · Vitest · Playwright · Vercel.

## Local

```sh
pnpm install
cp .env.example .env     # fill in; every variable has a one-line comment
pnpm db:migrate          # reads .env itself; uses DATABASE_URL_UNPOOLED
pnpm dev                 # app: http://localhost:3141 · site: http://site.localhost:3141
```

Port 3000 belongs to another project on this machine, so everything here uses 3141 (dev), 3142 (e2e).

| Command | What it does |
|---|---|
| `pnpm check` | Typecheck, lint, unit tests, production build. Must be green before merging. |
| `pnpm test` | Vitest. Database tests run on in-process PGlite with every migration applied. |
| `pnpm e2e` | Playwright against `next build && next start` on 3142, on the Neon branch in `E2E_DATABASE_URL` (its tables are truncated first), with `E2E_MODE=1`: mock model, file mail outbox, no rate limits. |
| `pnpm db:generate` | New migration from `src/db/schema.ts` (keep migrations additive). |
| `node scripts/drive/<name>.mjs` | Browser drives against a running built app (visible browser; `DRIVE_HEADLESS=1` to hide it). Screenshots land in `.drive/`. |

## Deploy (Vercel)

### Today: maintenance page only

1. Import the GitHub repo into Vercel (framework: Next.js; the `vercel-build` script runs migrations, then `next build`).
2. Add `41prompts.ai` and `app.41prompts.ai` to the same project.
3. No environment variables are needed. A production deployment shows the maintenance page on both hosts until `MAINTENANCE_MODE=0`.

### Launch checklist

1. **Neon.** Add the Neon integration (or paste URLs): `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). Production builds migrate automatically; previews do not.
2. **Hosts.** `NEXT_PUBLIC_APP_URL=https://app.41prompts.ai`, `NEXT_PUBLIC_SITE_URL=https://41prompts.ai`.
3. **Auth.** `BETTER_AUTH_SECRET` (`openssl rand -base64 32`). Production OAuth apps (separate from dev ones):
   - Google: authorised redirect URI `https://app.41prompts.ai/api/auth/callback/google`; the consent screen needs the Terms and Privacy URLs.
   - GitHub: callback `https://app.41prompts.ai/api/auth/callback/github` (one callback per OAuth app).
4. **Email.** Verify `41prompts.ai` in Resend (SPF, DKIM), then `RESEND_API_KEY` and `EMAIL_FROM`.
5. **Keys.** `KEYS_ENCRYPTION_KEY` (`openssl rand -base64 32`). Never change it without a rotation plan: existing keys stop decrypting.
6. **Cron.** `CRON_SECRET` (`openssl rand -hex 24`). `vercel.json` runs `/api/cron/purge` daily: prompts deleted more than 24 hours ago go for good, and expired sign-in tokens are cleared.
7. **Analytics and errors.** `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST` (turn on cookieless mode in the PostHog project settings, or cookieless events are dropped). `NEXT_PUBLIC_SENTRY_DSN`, plus `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for readable stack traces.
8. **Support.** `NEXT_PUBLIC_SUPPORT_EMAIL`, shown in the legal pages and footer.
9. Review the draft Terms and Privacy pages.
10. Set `MAINTENANCE_MODE=0` and redeploy.

### Turning on Performance pricing (B01)

Pricing and every upgrade path stay hidden while `NEXT_PUBLIC_PRICING_ENABLED` is not `true`; `/api/stripe/checkout` and `/api/stripe/portal` return 404. Before turning it on:

1. **Move the Vercel project to Pro.** Hobby is for non-commercial use, and collecting payments counts as commercial.
2. In Stripe: accept the Managed Payments terms (Stripe, through Link, becomes the merchant of record and handles sales tax, VAT and GST, receipts, refunds and disputes). Create the Performance product with tax code `txcd_10103001` (SaaS, business use) and a monthly price; set `STRIPE_PRICE_ID`.
3. Add the webhook endpoint `https://app.41prompts.ai/api/stripe/webhook` with events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `customer.deleted`; set `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY`.
4. Configure the Billing Portal (cancel at period end, update card, invoices).
5. Under Subscriptions and emails: turn on Smart Retries and the failed-payment and expiring-card emails. That is the grace period: `past_due` keeps Performance while Stripe retries.
6. Add the Terms and Privacy URLs in Checkout settings.
7. Set `NEXT_PUBLIC_PRICING_ENABLED=true` and redeploy.

Locally: `stripe listen --forward-to localhost:3141/api/stripe/webhook` and use its signing secret.

**Note:** the Performance tools themselves (P01–P08, D01–D05) are not built yet. They are visible, locked, and say "Tell me when it opens" (recorded in `performance_interest`, and as `performance_control_clicked` events in PostHog, which is the painted-door data `docs/FEATURES.md` asks for).

## How it fits together

- **Versions are immutable.** Every autosave inserts a `prompt_versions` row with the bloks as JSON and a note derived from the diff ("Edited B3", "Split B1"). Restoring inserts a copy as the new head. Only a version's `name` ever changes.
- **Autosave** keeps one request in flight with the newest snapshot, retries idempotently, keeps a local draft until the server confirms, and flushes when the tab hides.
- **Plan** is written only by Stripe webhooks (`user.plan`), read from the database on every check (`requirePerformance`), and never declared to Better Auth, so no client call can change it.
- **Your models** (`model_connections`, catalog in `src/lib/catalog.ts`): one row per labelled model. Credentials are one AES-256-GCM sealed blob whose authenticated data binds it to the user, the row and its destination (provider, base URL origin, Azure resource), so a saved key cannot be pointed at a new address without typing it again; only the last four characters ever leave the server. Duplicate re-seals on the server.
- **SSRF guard:** every server-side provider call (runs, model lists, key checks) goes through `src/server/net/guarded-fetch.ts`: https only, no redirects, and an undici agent that refuses private, loopback, link-local, CGNAT and metadata addresses at DNS time and again on the open socket.
- **Local models run in the browser** (`src/lib/browser-run.ts`): Ollama, LM Studio and custom local addresses are called straight from the tab with `fetch` and parsed as SSE, so nothing passes through our server and their keys stay in `localStorage` (cleared on sign-out). Chrome and Edge reach local addresses after a one-time Local Network Access prompt (plain http on the LAN needs `targetAddressSpace`, which the client sends); Firefox reaches only loopback over http; Safari blocks plain http even to localhost. The server must allow the app's origin in CORS (`OLLAMA_ORIGINS`, LM Studio's Enable CORS).
- **Go to app on the landing page:** the proxy keeps a `41p_app=1` hint cookie on the parent domain the two hosts share (`41prompts.ai`) in step with the session cookie. The static landing page reads it after load and folds Sign in and Start free into "Go to app". It carries no identity; the app still checks the real session. Locally `localhost` and `site.localhost` share no parent domain, so the hint stays on the app host (the drive and e2e copy it to the site host).
- **Privacy:** prompts are private; PostHog never receives prompt text or query strings; Sentry scrubs request bodies and anything key-shaped; deleting the account removes everything at once.
