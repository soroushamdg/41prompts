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

**The same line now appears under both textareas.** They differed for a day, because the Montréal
sentence was ruled for the landing line specifically — an artefact of how two rulings were written
rather than a decision, and ruled out on 2026-09-12: somebody arriving at `/decompile` directly
deserves the same specificity as somebody arriving from `/`.

### Strip 03 — replaced

Was:

> **03 — Fix it before it ships**
> Each unchecked rule comes with the check that would catch it. You make the change — there is nothing
> to install and nothing to sign up for.

Now:

> **03 — Add the check**
> Every rule that nothing checks comes with the check that would catch it, named in plain words. You
> add it where your tests already live.

Both objections were upheld, and **"before it ships" was the worse of the two**: it claimed a place in
the deploy path we do not occupy until Stage 5. There is no CI integration, no SDK check, nothing that
could block a ship — so the phrase promised a position in the workflow rather than overstating a
feature, which is the harder kind of claim to walk back.

The heading also fixes the scan. Three headings read in isolation now give **Paste → See the bloks,
and what nothing checks → Add the check**, which is three true things, the third of them plainly the
reader's own work. The previous set read as three things the product does.

"Named in plain words" is exact rather than decorative: ADR-003 requires check kinds to display as
plain phrases, and the detector's suggestion is literally `Add a "one of the allowed values" check.`
"Where your tests already live" is the other half of the same honesty — we do not host tests, run
them, or sit between the reader and their deploy.

**What it gives up, recorded because it was a real trade:** the urgency of "before it ships". That
urgency was borrowed against a capability we do not have, which is the only reason losing it is
acceptable.

### What passed

The headline, the subhead, strip 01's "no account, no email", strip 02 in full, strip 03's body, the
CTA band's "Free" and "no account", the footer blurb, and every string in the guide bar the storage
claim above.

One incidental proof the guard works: the new copy tripped `page.test.tsx`'s number allowlist with an
unexplained "30", which is `DECOMPILE_RETENTION_DAYS`. It is now listed with its reason.

### The closing band, and the count behind it

The band's heading has been through five versions. It ended at:

> **Prompts often have rules nothing checks.**

Version two, "Your prompt already has rules nothing checks.", was shipped in #50 and flagged in the
same commit: its stated reason was that it holds for every prompt the corpus has seen, and it does
not. The heading now claims less, and it makes no assertion about the reader's own prompt — which is
the part that could not be backed by anything, since the page has never seen it.

**The measurement, re-run from source rather than repeated.** The 29-prompt corpus
(`SEGMENT_FIXTURES`) put through the shipping pipeline — `cluster(segment(text))`, then `detect()`,
then `uncheckedRuleCount(bloks, text, findings)` — with "states a rule" read as *at least one
`constraint` blok*:

| group | prompts | state a rule | have a rule nothing checks |
|---|---:|---:|---:|
| structure | 12 | 10 | 6 |
| encoding | 9 | 7 | 1 |
| prose | 4 | 4 | 2 |
| multimodal | 4 | 4 | 2 |
| **total** | **29** | **25** | **11** |

The eleven: `support-email-router`, `fenced-json-schema`, `unmatched-tag`, `numbered-rules`,
`few-shot-examples`, `tool-use-agent`, `crlf-line-endings`, `short-paragraphs`, `repeated-sentence`,
`design-review-screenshots`, `invoice-photo-reader`.

**What the count does and does not support, stated plainly because it was measured and not assumed.**
11 of 25 is **44%**, which is *under half*. That rules out any word meaning "more than half" —
"every", "most", and "usually", which is "most" in different clothes. It supports **"often"**, a claim
about frequency rather than about a majority, and it supports the number itself.

### The pattern across all three corrections, which is the part worth keeping

| version | claim | true? |
|---|---|---|
| "Paste a prompt. See what is in it." | none | — |
| "Your prompt already has rules nothing checks." | about **the reader's** prompt | no — the page has never seen it |
| "Most prompts have rules nothing checks." | > 50% | no — 44% |
| "Prompts usually have rules nothing checks." | > 50% | no — same word, same 44% |
| **"Prompts often have rules nothing checks."** | frequent, not majority | **yes** |

**The count was right every time. The quantifier was wrong every time.** 11 of 25 was measured once
and never moved; three successive headings reached past it, each by a smaller margin than the last,
and each was caught by arithmetic rather than by taste.

So, for whoever writes the next line of this kind: **reach for the number before the adjective.**
Decide what the measurement supports, then find the word for it. Going the other way — picking the
word that reads well and checking afterwards whether the data covers it — is what produced three
corrections, and the third was as wrong as the second.

The decisions here were Soroush's and so were all three corrections.

Two further cautions on the number itself:

- **The corpus is a test corpus.** Nine of the 29 are encoding fixtures (BOM, lone CR, RTL,
  whitespace-only) and exist to break the segmenter, not to read like something an engineer wrote.
  On the twelve `structure` fixtures — the ones closest to a real prompt — it is 6 of 10, which is
  over half. That slice was chosen *after* seeing the numbers, so it is an observation, not evidence.
- **It measures our detector, not the world.** `rule_without_check` firing is not the same fact as a
  rule genuinely going unchecked; `MAX_RULES_WITHOUT_CHECKS` also caps what is reported per prompt,
  though it does not affect this count, which uses `uncheckedRuleCount`.

Re-run it against the corpus before citing it again; it moves whenever a detector or a fixture moves.

### A gap in `page.test.tsx`, named rather than filed

`page.test.tsx` is the guard that makes criterion 10 a build failure instead of a sentence in a
report. It catches what it was built to catch: an unexplained digit (every number on the page must be
listed with a reason), social proof ("trusted by", "join N", customer counts, star ratings,
testimonial furniture), fake urgency, and invented awards.

**It cannot catch a confident assertion about the reader.** "Your prompt already has rules nothing
checks." contains no number, no logo, no testimonial and no urgency — it passed every assertion in
that file, and it was still the least defensible sentence on the page, because it stated a fact about
a prompt the product has not seen. "Most prompts…" is a weaker version of the same class: a
quantifier over a population, backed by a corpus that does not reach it.

This is not fixable by a pattern — the failing sentences are ordinary English with no tell, and a
regex broad enough to catch "your prompt already has…" would also catch legitimate second-person
copy, which is most of the page. The guard would have to know what the product can observe.

**So the guard was changed to do the thing it can do.** Ruled on 2026-09-12: the band's heading is now
asserted by text in `page.test.tsx`, alongside the hero sentence that was already pinned that way.

Be precise about what that buys, because it is not detection. The assertion **cannot tell whether the
sentence is true** — nothing in that file can. What it does is make the heading a *decided* string:
it cannot be changed by a tidy-up, only by somebody deciding to change it and updating the test in the
same edit. Given this heading has been wrong three times, that is the useful property.

The class itself stays open: **a green `page.test.tsx` is still not a truthfulness check.** A new
claim about the reader, somewhere else on the page, is checked by a person or it is not checked.

**The visual-regression baselines did not cover it either, and that was measured here.** With the new
heading live and confirmed in the served HTML, `landing-{light,dark}-linux.png` still compared clean
against the *old* baselines: `maxDiffPixelRatio: 0.01` on a full-page shot absorbs an entire heading
swap.

**Ruled a defect in the guard rather than an observation**, and fixed in the direction that keeps both
properties: the 1% tolerance stays, because it is right for the anti-aliasing difference between the
snapshot image and GitHub's runner, and the copy is now asserted by *text* in `page.test.tsx` instead.
Pixels guard layout; text guards copy. Using one for the other is what failed here.

The new assertion was proved to fail before it was trusted: changing the heading to "Prompts often
have rules nothing checks." turns `page.test.tsx` red on that one test.

Baselines are regenerated with `--update-snapshots=all` — plain `--update-snapshots` is `changed` mode
and rewrites nothing when the comparison passes, which is precisely the trap above.

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

Locally and in CI: 123 e2e tests, including 36 on the host rule, 5 on the nav's two states, 4 on the
cookie domain, the signed-out-cookie replay, and the sitemap-driven canonical guard.

### Production — verified 2026-09-12, on `v0.4.0` and re-checked on `v0.5.0`

Checked against the deployment rather than inferred from the suite. Read-only throughout; cookie
values redacted.

- [x] **The apex serves the public product and `app.` serves the session.** `/`, `/decompile`, the
      guide, `llms.txt`, `robots.txt` and `sitemap.xml` all 200 on `41prompts.ai`; `/sign-in` 200 and
      `/app` 307 to the session gate on `app.41prompts.ai`. The landing page carries all seven new
      strings and none of the six retired ones.
- [x] **301 both directions, query string intact.** `41prompts.ai/app` → `app.41prompts.ai/app`,
      `41prompts.ai/sign-in` → `app.41prompts.ai/sign-in`, `app.41prompts.ai/` → `41prompts.ai/`,
      `app.41prompts.ai/decompile?start=abc123` → `41prompts.ai/decompile?start=abc123`. `/healthz`
      serves on both, unredirected.
- [x] **The session cookie crosses hosts with every attribute intact.** Read from response headers,
      by name, on the sign-out expiry path:

      ```
      set-cookie: __Secure-41prompts.session_token=<redacted>; Max-Age=0;
                  Domain=.41prompts.ai; Path=/; HttpOnly; Secure; SameSite=Lax
      ```

      Because this is the *expiry*, it also demonstrates the half no test had shown against a
      deployment: **sign-out clears the cookie on the parent domain**, so it dies on every host at
      once.
- [x] **Canonicals and the sitemap name the apex only; `/d/` is still `noindex`.** All three sitemap
      pages canonical to `41prompts.ai`, `robots.txt` advertises the apex sitemap, and a real
      permalink returns `x-robots-tag: noindex, nofollow, noarchive` with the matching meta tag.
      *(`/decompile` had no canonical at all when first checked — fixed under the window's exception
      in `v0.5.0`; see `m1-window.md`.)*
- [x] **The nav reads the session server-side, with no flash.** Anonymous: `nav-sign-in` in the
      server-rendered HTML, pointing at `app.41prompts.ai/sign-in`, no dashboard link. Signed in
      (confirmed by Soroush, 2026-09-12): `nav-dashboard` **in the server-rendered HTML** at
      `41prompts.ai` with `href="https://app.41prompts.ai/app"` and no sign-in link. The cookie
      crosses, the read is server-side, and there is no flash.

**The split is verified in production.**

### Staging — verified 2026-09-12

Both hosts settled on the expected commit first, then checked twice with a pause between, because an
earlier look had caught a redeploy mid-flight and a transient must not be read as a result.

- [x] **Each host serves its own half.** `/`, `/decompile`, the guide, `llms.txt`, `robots.txt` and
      `sitemap.xml` all 200 on `staging.41prompts.ai`; `/sign-in`, `/sign-up` and `/healthz` all 200 on
      `app.staging.41prompts.ai`.
- [x] **301 both directions.** `staging/app` → `app.staging/app`, `staging/sign-in` →
      `app.staging/sign-in`, `app.staging/decompile` → `staging/decompile`, `app.staging/` →
      `staging/`.
- [x] **The session cookie.**
      `__Secure-41prompts.session_token=<redacted>; Domain=.staging.41prompts.ai; Path=/; HttpOnly;
      Secure; SameSite=Lax` — scoped one level below production.

      > **Correction, 2026-09-12.** This line originally ended "so the two cannot collide." **That
      > was wrong, and it was the bug.** The scoping is *one-directional*: staging's cookie cannot
      > reach production, but production's `Domain=.41prompts.ai` reaches **every** subdomain,
      > staging included. With both deployments using the prefix `41prompts`, a browser signed into
      > production sent two cookies named `__Secure-41prompts.session_token` to staging; one
      > silently won, and when production's did, staging bounced every `/app` request to sign-in
      > while four perfectly good sessions sat in its database. Fixed by deriving the cookie prefix
      > from `DEPLOY_ENV` — see `apps/web/lib/site/cookie-prefix.ts` and `docs/PROCESS.md`.
- [x] **Canonicals, sitemap and `noindex`.** All three sitemap pages canonical to
      `staging.41prompts.ai`; the sitemap and `robots.txt` name it too; `/d/` returns
      `x-robots-tag: noindex, nofollow`.

**Both hosts pass all four checks. The split is verified on staging and in production.**

*History, because it took two attempts:* the first re-check found the certificate fixed but
`PUBLIC_SITE_URL` and `BETTER_AUTH_URL` still swapped — the apex 301ing its own marketing paths away,
its `/sign-in` serving 200, and `app.staging`'s sitemap and canonical both naming `app.staging`, which
is `siteOrigin()` reading the app host. Corrected in Coolify and confirmed above.

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

