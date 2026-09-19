<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# What the three providers' own terms say

Read on **2026-09-16** from the pages linked below, for EPIC-042's task *"provider usage policies
confirmed"*. Every claim here is a summary of a published document with a link to it; nothing here
is legal advice, and **none of it has been read by a lawyer** — EPIC-071 holds that hour and is
`deferred` (`docs/backlog.md`).

Re-read it when a provider changes its terms, when this product starts publishing comparisons
between providers, or when the first business customer asks. Each section names the date it was read
so a stale answer is visible rather than assumed.

## Why this document exists, and who it is for

A person brings their own key. The calls this product makes with it are made **under their agreement
with that provider, not ours** — so what their provider does with their prompts is a fact about
their account that they can only find out from a page they were never going to read. Three of those
facts are surprising enough to be worth writing down, and one of them is a live product decision.

---

## The one that matters most: Google's unpaid quota

**A Gemini API key works on both the unpaid and the paid quota, and the two have different data
terms.** From the Gemini API Additional Terms of Service
(<https://ai.google.dev/gemini-api/terms>, read 2026-09-16):

> When you use Unpaid Services, including, for example, Google AI Studio and the unpaid quota on
> Gemini API, Google uses the content you submit to the Services and any generated responses to
> provide, improve, and develop Google products and services and machine learning technologies […]
> To help with quality and improve our products, human reviewers may read, annotate, and process
> your API input and output.

and, for the paid quota:

> When you use Paid Services, including, for example, the paid quota of the Gemini API, Google
> doesn't use your prompts (including associated system instructions, cached content, and files such
> as images, videos, or documents) or responses to improve our products, and will process your
> prompts and responses in accordance with the Data Processing Addendum […]

**The consequence for this product.** A person on the unpaid quota who runs a suite here has their
prompts and the model's answers used to improve Google's products, and possibly read by a person.
**The API does not say which quota a key is on**, so `apps/worker/src/runs/google.ts` cannot tell and
neither can the settings page. The honest response is to say it for every Google key rather than to
guess, and that is what Settings → Providers does.

This is also the sharpest argument for the guidance EPIC-043 already wrote — *make a key for
41Prompts alone* — because a key scoped to this product is a key whose exposure is bounded by what
this product sends.

## OpenAI

From *Your data* (<https://platform.openai.com/docs/guides/your-data>, read 2026-09-16):

- **`/v1/chat/completions`** — the endpoint this product uses — is listed as **"Data used for
  training: No"**.
- Abuse-monitoring logs are generated for all API feature usage and **retained for up to 30 days**
  by default, unless longer retention is required by law. Zero Data Retention and Modified Abuse
  Monitoring exist, are per-organisation, and **require OpenAI's prior approval** — so they are the
  customer's to arrange, not ours.

**Why the adapter uses `.chat(...)` and not the Responses API.** The Responses API keeps
conversation state server-side by default, which would leave an object behind at OpenAI under the
person's own key, outliving the run, on an account whose retention this product cannot promise
anything about. `/v1/chat/completions` is stateless. The reasoning is repeated in
`apps/worker/src/runs/openai.ts` so nobody "modernises" it without meeting the argument.

## Anthropic

From the Commercial Terms of Service (<https://www.anthropic.com/legal/commercial-terms>, read
2026-09-16):

- **"Anthropic may not train models on Customer Content from Services."** Customer Content is
  defined there as Inputs and Outputs together.
- The customer **retains all rights to its Inputs** and **owns its Outputs**; Anthropic assigns what
  rights it may have in Outputs to the customer.

## The restriction all three have, and the one open question it raises

Every one of the three forbids using the service to build a competing service or to resell it.
Anthropic's is the most explicit (Commercial Terms D.4):

> Customer may not and must not attempt to (a) access the Services to build a competing product or
> service, including to train competing AI models or resell the Services except as expressly
> approved by Anthropic […]

**With a key a person brings, this is not our question.** The call is made with their credential
under their own agreement; this product is a client they chose to point at their own account, in the
same category as any other tool they run their prompts through.

**With the deployment's own key, it is a real question and it is open.** When somebody with no key
of their own runs a prompt, `providerForRun` falls back to `ANTHROPIC_API_KEY` and the product is
then providing model access to an end user on our agreement. Whether that is "reselling the
Services" is a judgement about words in a contract, which is exactly the kind of question EPIC-071's
lawyer hour exists for.

**What is done about it today, and what is not.** Nothing about the fallback changed in EPIC-042 —
it is what every run has done since EPIC-031a and it is how the free tier works. It is written down
here so that the question is on the record before Stage 6 turns the free tier into a priced product,
which is the moment it stops being theoretical. EPIC-070 (Stripe, free/pro/team, **BYO-key unlock**)
is the row that will have to answer it.

## Published comparisons

`docs/backlog.md`'s EPIC-071 already carries *"provider ToS re-check for published comparisons"* and
EPIC-035's review line says *"Provider terms re-read before any published comparison."* Nothing in
EPIC-042 publishes one — the matrix is a private page behind a sign-in, showing a person their own
runs on their own keys. **Publishing one is a separate act and needs this document re-read first**,
because the benchmark-publication clauses are where these three differ most and where a summary
written for a different purpose is most likely to mislead.

## What was read, and what was not

| Provider | Document | Read |
|---|---|---|
| Google | Gemini API Additional Terms of Service | 2026-09-16 |
| Google | Gemini API pricing (for the paid/unpaid split and the "used to improve our products" row) | 2026-09-16 |
| OpenAI | *Your data* (API data controls, retention, endpoint table) | 2026-09-16 |
| Anthropic | Commercial Terms of Service | 2026-09-16 |

**Not read:** every provider's acceptable-use policy, their DPAs, their sub-processor lists, and any
enterprise agreement that would supersede the above. Those matter for a business customer and this
product does not have one yet; `docs/backlog.md`'s EPIC-071 is where they belong.
