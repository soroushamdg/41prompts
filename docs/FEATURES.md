# 41prompts · Final feature list

Categories follow the Kano model. Plans follow one rule:

- **Free plan:** every Must-be feature, unlimited.
- **Performance plan:** every Performance feature and every Delighter.

**Customer:** someone who writes serious prompts and wants to save, test and share them.

**What "unlimited" covers:** no cap on prompts, bloks, versions or Free runs. Free runs use the user's own models and keys, so they cost 41prompts nothing.

Feature IDs match the landing page's bill of materials and the upgrade sheet. Use them in issues, commits and tests.

> These placements are hypotheses. Kano categories come from customers, through paired survey questions to at least 30 active users ("How would you feel if it had X?" and "How would you feel if it didn't?"). Re-check them every 6 months, because delighters decay into performance features and then into must-bes.

---

## Must-be · Free plan, unlimited

If any of these is missing, people leave. Having them earns no credit.

| ID | Feature | What's expected |
|---|---|---|
| M01 | **Account** | Email magic link, plus Google and GitHub sign-in. One form handles sign-in and sign-up. Sign-up takes under 30 seconds with no card. The session persists across devices. The magic link works once and expires in 15 minutes. |
| M02 | **Paste or create a prompt** | Paste a prompt of any length (up to about 100 KB), or start blank from a chosen blok type. Markdown and `{{variables}}` are preserved. Variables are detected live while pasting. Names are slugified. Autosave runs every few seconds, and typed text is never lost. |
| M03 | **Bloks editor** | Four blok types: context, constraint, example and expects. Add, edit in place, duplicate, delete with undo, and reorder by dragging the grip or with the keyboard (focus the grip, then ↑ ↓). Hovering a blok highlights its span in the compiled prompt, and the reverse. Expects bloks never reach the compiled prompt. |
| M04 | **Compiled prompt, one-click copy** | The compiled prompt rebuilds live. It shows as a template or with variables filled, and shows a token and character count. Copy plain text in one click with a confirmation. Also copies as Markdown or JSON. |
| M05 | **Versions** | Every autosave burst becomes a version, unlimited. Open any version read-only. Restoring creates a new version, so nothing is overwritten. Versions can be named (for example, "works on Claude"). |
| M06 | **Run on one model** | Run the compiled prompt once on one of the user's models, with a test message. The reply streams in, with tokens, time and cost (cost when a price is known; "—" otherwise). Hosted models run on our server with the user's key; models on the user's own computer or network run straight from the browser, so nothing passes through our server. The provider bills the user. *Added in this revision: without it, Free models would do nothing.* |
| M07 | **Your models** | Starts as an empty list with **Add model**. A dialog offers 20+ well-known providers (OpenAI, Anthropic, Google Gemini, OpenRouter, Azure OpenAI, Amazon Bedrock, Mistral, Groq, xAI, DeepSeek and more), local servers (Ollama, LM Studio) and **Custom** for any OpenAI-compatible endpoint, such as vLLM, llama.cpp or a self-hosted gateway. Each item is one model: a required label (unique per user), the provider's fields, and a model picked from the provider's live list or typed. One provider or key can appear many times; **Duplicate** copies the saved key without typing it again. Keys are encrypted at rest, bound to the address they were saved for, shown once, never logged. Keys for models in the browser stay in that browser. **Connect and load models** checks the key and lists the models; **Test** shows the latency; prices come from the provider's list, a curated table, or OpenRouter's public prices, and the user can edit them. The dialog says which browsers can reach a local model (Chrome and Edge reach local addresses after asking once; Firefox reaches only this computer over http; Safari needs https) and how to let the server answer this site. A run on a removed model, or one whose key no longer opens, gets a clear message. |
| M08 | **Private library with search by name** | Private by default. A list sorted by last edited, name or version count. Search filters by name as you type and highlights the match. Rename, duplicate, archive, and delete with undo. Cmd/Ctrl+K focuses search. |
| M09 | **Export everything** | The whole library with every version, as Markdown plus JSON in one .zip, with visible progress. |
| M10 | **Delete account** | Typing DELETE confirms. Removes every prompt, version and saved model, and says so in plain words. |

### Platform must-have (not a plan feature)

| ID | Feature | What's expected |
|---|---|---|
| B01 | **Stripe billing** | Upgrade opens Stripe Checkout as a hosted page; 41prompts never touches card data. A Stripe billing portal handles card changes, invoices and cancelling. Webhooks set `plan` on the account, and Performance is enforced on the server, never only hidden in the UI. Failed payments get a grace period and an email. Cancelling keeps all data on Free. Sales tax: Checkout runs with Stripe Managed Payments, so Stripe (through Link) is the merchant of record and handles sales tax, VAT and GST, receipts, refunds and disputes. |

---

## Performance · Performance plan

Satisfaction scales with quality. Ordered by strength of edge.

| ID | Feature | What's expected |
|---|---|---|
| P01 | **Failure attribution to the exact blok** | Every failed check points at the blok most likely to have caused it, with a confidence score. Attribution is per model. Clicking a failure jumps to the blok. Checks that could not be graded are reported as such, never counted as passes. Re-run cost is shown before running. |
| P02 | **Linter** | Runs on import and on demand. Flags repeated rules, contradictions between bloks, and untestable language ("be helpful"). Each finding points at exact text, with a severity and a suggested fix. Findings can be dismissed per prompt. |
| P03 | **Decompiler** | Paste a long prompt and get typed bloks back. The user can correct a type or merge and split bloks. No text is lost: by default the compiled output equals the original. Anything that could not be classified is shown. |
| P04 | **Tests from expects bloks** | Each expects blok becomes a check: contains, excludes, valid JSON, length, or an LLM-judged criterion. Takes sample inputs. Run everything in one click. Results are stored against the version they ran on. |
| P05 | **Cross-model runs** | Any of the user's models side by side (hosted, custom or local, mixed freely), each on its own key. Shows pass rate, cost and p50 latency per model. Estimated cost is shown before running; models without a price show tokens and time only. |
| P06 | **Search inside prompts, tags, filters** | Cmd/Ctrl+K searches names, tags and the text inside every blok, with results under about 200 ms. Filter by tag, model, last edited and test status. |
| P07 | **Semantic diff** | Compare any two versions. Changes are shown per blok (added, removed, changed, moved) with word-level diffs inside, and test results that changed are shown beside the diff. |
| P08 | **Shared workspaces (async)** | Private and shared workspaces. Invite by link or email, with expiry and revoke. Roles are owner, editor and viewer. Member list with avatars. Every version shows who made it. Ship only after the "Invite teammates" painted-door test passes (at least 10% of weekly users click it). |

---

## Delighters · Performance plan

Absence costs nothing; presence creates disproportionate satisfaction.

| ID | Feature | What's expected |
|---|---|---|
| D01 | **Public share pages** | One click creates a read-only public page showing the bloks, compiled prompt, lint findings and last results. It has a clean social preview image and a "Test this on your models" button. Creating a page needs Performance; viewing is free for anyone, with or without an account. The owner can unshare at any time, and the link stops working. |
| D02 | **Typed function export** | Download a `.ts` or `.py` file where the prompt is a function: variables become typed parameters and the expected output format becomes the return type. No runtime dependency on 41prompts. |
| D03 | **Presence** | A "Sara is editing" badge when someone else has the prompt open. It uses a roughly 30-second heartbeat, not live sync, and warns before you save over a newer version. Shared workspaces only. |
| D04 | **First-run aha** | A new user's own first prompt is linted once, and the finding points at the blok responsible. *This needs one free Performance run on the first prompt.* Recommended as the only exception to the plan rule, because it is the moment that sells Performance. |
| D05 | **Live cursors and co-editing** | Deferred. Build only if data shows two people regularly editing the same prompt within 5 minutes of each other. |

---

## Cut

Not in any plan. Delete the code; tag the commit before deleting.

- SDK runtime fetch and live publishing. These put 41prompts in other apps' request path and make you on-call.
- Bundled fallback and publish gating, which existed only to protect the runtime.
- Staging server. Use the built app locally (`next build && next start`) against a Neon branch before deploys.
- Lessons curriculum. The first-run aha (D04) replaces it.
- A/B comparison view. P05 and P07 cover it.
- Creator stats, prompt chains, and hosted runs paid for out of your own inference budget.
