# Host split — `41prompts.ai` and `app.41prompts.ai`

Shipped inside the M1 window under its exception: **it affects findability, which is what M1
measures.** Recorded in `m1-window.md`'s table of changes made inside the window.

---

## 1. What it does

| host | serves | indexable |
|---|---|---|
| `41prompts.ai` | landing page, `/decompile`, `/d/<id>`, the guide, `llms.txt`, `robots.txt`, `sitemap.xml` | yes |
| `app.41prompts.ai` | `/app/*`, `/sign-in`, `/sign-up`, `/api/auth/*` | no |

A request for the wrong kind of path on either host is **301**ed to the same path on the other, query
string intact. Canonical URLs and `sitemap.xml` name the apex only.

**One source of truth.** `lib/site/hosts.ts` holds the classification; the proxy redirects from it,
`robots.ts` disallows from it, and a test walks every `page.tsx` and `route.ts` in `app/` asserting
each is classified. Two lists would disagree the first time a route was added.

**It is inert until configured.** With `PUBLIC_SITE_URL` unset, or equal to `BETTER_AUTH_URL`, there is
no split and no redirects — which is what keeps `localhost:3000` working, and what makes shipping this
a no-op in production until the variables in §5 are set.

**It refuses to redirect on an unrecognised `Host`.** That header is attacker-controllable; sending
somebody to another origin on the strength of it would be an open redirect with extra steps.

---

## 2. The cookie, and a premise worth correcting

The brief said: *"Scope it to `.41prompts.ai`, which rules out the `__Host-` prefix."*

**`__Host-` was never in use, so nothing is given up.** Better Auth 1.7.2 prefixes the session cookie
`__Secure-`: `HOST_COOKIE_PREFIX` is defined in its source and never applied to the session cookie.
Checked in the installed package and then confirmed against production:

```
$ curl -i -X POST https://app.41prompts.ai/api/auth/sign-in/social -d '{"provider":"google",…}'
set-cookie: __Secure-41prompts.state=…; Max-Age=300; Path=/; HttpOnly; Secure; SameSite=Lax
```

Host-only, as described — but because there is no `Domain`, not because of a prefix. And `__Secure-`
**permits** a `Domain`. So:

- the prefix stays `__Secure-`,
- the cookie **name does not change**, so existing sessions are not invalidated,
- `Secure`, `HttpOnly`, `SameSite=Lax` are untouched,
- the only attribute added is `Domain`.

### ⚠️ What it does widen

**Every host under `SESSION_COOKIE_DOMAIN` now receives the session cookie.** Adding a subdomain of
`41prompts.ai` is from today a security decision, not a DNS one. If a host does not need the session,
it should live on a different registrable domain.

The sharpest instance already exists: **`staging.41prompts.ai` is a subdomain of the production
domain**, so a browser holding a production session sends that cookie to staging. Staging cannot *use*
it — different database, different `BETTER_AUTH_SECRET` — but it receives it, and staging is the
less-defended box. Staging's own cookie is scoped to `.staging.41prompts.ai` so the reverse does not
happen and the two cannot overwrite each other, but the production→staging direction is unavoidable
while they share a registrable domain. Moving staging off it is worth doing before anything sensitive
sits behind the session. Same warning in `infra/README.md`, next to the DNS records.

**Sign-out kills it everywhere at once.** Better Auth's `expireCookie` spreads the same attributes it
set, `Domain` included, so the deletion matches the cookie. `a signed-out cookie cannot reach /app,
even replayed by hand` proves the stronger half: the *value* is dead server-side, so a copy kept in
another tab, another subdomain or a clipboard is worthless.

---

## 3. The nav, without a flash

`SiteNav` is a pure component taking `signedIn`; `SiteNavWithSession` reads the session on the server
and hands it over. That split exists so the two states are unit-testable without a browser — an
effect-driven version could only be tested by watching for the flash, which is to say by watching for
the bug.

The e2e test fetches `/` with the session cookie and asserts `Go to dashboard` is **in the raw HTML**,
not merely visible after hydration. Screenshots: `screenshots/host-split/nav-signed-{in,out}.png`.

The nav returns "Sign in" rather than throwing if the session lookup fails. The nav is not a security
boundary — `/app/*` is gated by the proxy and by `requireSession` — and a marketing page that 500s
because a database was briefly slow is a worse trade than one that says "Sign in".

---

## 4. Landing copy, and a truthfulness audit that failed

The decided copy shipped in `v0.3.0`: eyebrow deleted, headline unchanged, new subhead, new CTA
("See what nothing checks"), new note under the textarea.

Then the instruction: *re-check every remaining string against one test — is it literally true of what
ships today — and report anything that fails rather than silently fixing it.*

### It failed in eleven places

`v0.2.0` added `decompile_runs`, which writes one row per decompile: a keyed address hash, two
integers, a timestamp. No prompt text. That makes **"nothing is stored" false.**

**Where the phrase came from.** It is EPIC-014's, from the scope Soroush wrote, and it was **already
imprecise before `v0.2.0` made it false** — the system has stored `decompiles` rows, `waitlist` rows
and Better Auth sessions since long before the counter existed. What was always true is the narrower
claim about the prompt. `v0.2.0` did not introduce the imprecision; it removed the last reading under
which the sentence could be defended. The audit is what caught it.

### The ruling, applied to all eleven

**Never claim the system stores nothing** — it stores a counter row, and a sceptical reader who learns
that later discounts everything else on the page. Where the sentence is about the prompt it becomes
**"your prompt is not saved"**; where the clause was doing no work it is **deleted**.

| # | where | was | now |
|---|---|---|---|
| 1 | `page.tsx` strip 01 | "No account, no email, nothing stored." | "No account, no email, and your prompt is not saved." |
| 2 | `page.tsx` CTA band | "Free, no account, and nothing is stored." | **deleted** → "Free, and no account." |
| 3 | `page.tsx` metadata | "Free, no account, nothing stored." | "Free, no account, and your prompt is not saved." |
| 4 | `layout.tsx` metadata | "Free, no account, nothing stored." | "Free, no account, and your prompt is not saved." |
| 5 | `opengraph-image.tsx` | "Free · no account · nothing stored" | "Free · no account · prompt not saved" |
| 6 | `decompile/page.tsx` heading | "No account, and nothing is stored." | "No account, and your prompt is not saved." |
| 7 | `decompile/page.tsx` metadata | "No account, nothing stored." | "No account, and your prompt is not saved." |
| 8 | `decompile-view.tsx` limit line | "Up to 100 KB. Nothing is stored." | "Up to 100 KB. Your prompt is not saved." |
| 9 | `decompile-view.tsx` empty state | "No account, nothing stored." | **deleted** |
| 10 | `guides/…` article | "there is no account, nothing is stored" | "there is no account, your prompt is not saved" |
| 11 | `llms.txt` | "No account, nothing stored, free." | "No account, free, and your prompt is not saved." |

**The two deletions, and why those two.** Each was the third statement of the same fact on one screen.
`/` said it in strip 01, in the note under the textarea and again in the closing band; `/decompile`
said it in the header paragraph, under the textarea and again in the empty state. The deleted copies
are the ones furthest from the moment the reader is deciding whether to paste.

Three code comments that quoted the retired promise were updated with it, so the source does not go on
citing copy that no longer exists.

**Left alone:** `llms.txt`'s "Nothing you paste is kept unless you ask for a shareable link" — already
about the prompt specifically, and still true.

### "Your prompt stays on this page" — replaced

It was false: segmentation, clustering and detection all run on the server by design (EPIC-013
decision 1). The line under the ask bar now reads:

> Up to 100 KB. **Your prompt is processed on our servers in Montréal and is not saved.** Create a
> link and it lasts 30 days; anyone with one can delete it.

The middle sentence is verbatim as ruled. The rest keeps the cap and the link facts, with "those"
repointed to a working antecedent.

**One consequence worth a look.** The two lines under the two textareas now differ — the landing page
names Montréal, `/decompile` says only "Your prompt is not saved". That follows the rulings literally
(the Montréal sentence was ruled for the landing line specifically) and it is defensible, since the
landing page is the first touch. Say the word if they should be identical.

### Strip 03 — not touched, awaiting a ruling

Current heading and body:

> **03 — Fix it before it ships**
> Each unchecked rule comes with the check that would catch it. You make the change — there is nothing
> to install and nothing to sign up for.

**The objection.** Two things, and the body only answers one of them.

1. *"Fix it"* is an imperative that reads as a product capability. The product does not fix anything:
   it lists rules with no check and names the check that would catch each one. The body's "You make
   the change" corrects this — but a reader scanning only the three headings gets **Paste → See the
   bloks → Fix it before it ships**, which reads as three things the product does, and the third is
   the reader's own work done somewhere else entirely.
2. *"before it ships"* implies we sit in the deploy path. We do not. There is no CI integration, no
   SDK check, nothing that could block a ship — that is Stage 5. The phrase promises a position in the
   workflow that the product has not got.

**Why it was left rather than rewritten:** the heading's honest version is weaker as copy, and which
of the two problems matters more is a positioning call. Something like "See what to fix" keeps the
scan honest and loses the urgency; "Change it yourself" is accurate and flat.

### What passed

The headline, the subhead, strip 01's "no account, no email", strip 02 in full, strip 03's body, the
CTA band's "Free" and "no account", the footer blurb, and every string in the guide bar the storage
claim above.

One incidental proof the guard works: the new copy tripped `page.test.tsx`'s number allowlist with an
unexplained "30", which is `DECOMPILE_RETENTION_DAYS`. It is now listed with its reason.

---

## 5. The checklist

### Coolify

**Production** (`d180rye1…`):

| variable | value |
|---|---|
| `PUBLIC_SITE_URL` | `https://41prompts.ai` |
| `BETTER_AUTH_URL` | `https://app.41prompts.ai` *(unchanged)* |
| `SESSION_COOKIE_DOMAIN` | `.41prompts.ai` |

**Staging** (`pboa5wxr…`):

| variable | value |
|---|---|
| `PUBLIC_SITE_URL` | `https://staging.41prompts.ai` |
| `BETTER_AUTH_URL` | `https://app.staging.41prompts.ai` |
| `SESSION_COOKIE_DOMAIN` | `.staging.41prompts.ai` |

A **redeploy**, not a restart: `docker restart` replays the old container's `Config.Env`, which is what
cost an hour on the Turnstile rename.

### DNS

| record | type | value |
|---|---|---|
| `app.staging.41prompts.ai` | A | `3.97.92.244` **← the only new record** |

Then add that host to the staging application's domains in Coolify so Traefik routes it and issues a
certificate. `41prompts.ai` and `app.41prompts.ai` already resolve.

> `app.staging.…` rather than `app-staging.…` on purpose: a cookie scoped to `.staging.41prompts.ai`
> reaches hosts *under* `staging.41prompts.ai`, and `app-staging.41prompts.ai` is not one of them —
> the apex-to-app session would not work on staging, which is the thing staging exists to test.

### OAuth callback URLs

Both land on the `app.` host, because that is where `BETTER_AUTH_URL` points.

**Google** — APIs & Services → Credentials → OAuth 2.0 client → Authorised redirect URIs:

```
https://app.41prompts.ai/api/auth/callback/google
https://app.staging.41prompts.ai/api/auth/callback/google
```

**GitHub** — Settings → Developer settings → OAuth Apps → Authorization callback URL (one per app, so
staging needs its own, which is already how the two are separated):

```
production app:  https://app.41prompts.ai/api/auth/callback/github
staging app:     https://app.staging.41prompts.ai/api/auth/callback/github
```

Production's Google and GitHub URLs are unchanged — `BETTER_AUTH_URL` was already `app.41prompts.ai`.
**Only staging's are new.**

---

## 6. Verification

Locally and in CI: 122 e2e tests, including 36 on the host rule, 5 on the nav's two states, 4 on the
cookie domain, and the signed-out-cookie replay.

**Not verified on staging**, and it cannot be until §5's variables and the DNS record exist — the split
is inert without them, by design. That is also why merging and tagging this is safe: production
behaviour does not change until `PUBLIC_SITE_URL` is set. The order that follows is: set staging's
three variables and the DNS record, confirm the redirects and a sign-in there, then set production's.

---

## 7. One more thing fixed on the way

The logo's wrapper carried a **hydration mismatch** on every page load: EPIC-016 suppressed the
mismatch on the two morphing `<path>` elements and missed `data-logo-ready` on the element the script
stamps. It cost nothing at runtime and put an error in the dev console on every load, which is how a
console stops being worth reading.

---

## 8. A perf gate demoted on the way through

CI failed on this branch with `expected 106.64 to be less than 100` — `detect.perf.test.ts`'s absolute
100 KB budget, in a package this PR does not touch.

**It is not tail noise.** The number is the *minimum* of ten warm runs, and a minimum is already the
robust estimator under contention — EPIC-014's own finding. The runner was about 7% slower than the
machine the budget was set on. An absolute millisecond budget on a shared runner measures the runner.

EPIC-014's standing instruction for exactly this: *"fix the measurement or demote it to a reported
number, and say which and why. Do not widen the bar."* **Demoted.** The bar is untouched, and it is
the same treatment the 1 MB case in that file already had.

**What it costs, said plainly:** the growth exponent still catches an algorithmic regression, but a
**constant-factor** one — three times slower at every size — would now pass everything in the file.
The proper fix is a budget calibrated against a machine-speed baseline rather than wall-clock
milliseconds, which is worth doing properly rather than at the end of a long branch. Recorded in
`m1-window.md` under "Held until the window closes".

