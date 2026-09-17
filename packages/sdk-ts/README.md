# @41prompts/sdk

Resolve a published prompt at runtime, in Node.

**Three rules.** `resolve()` never waits for the network. It never throws. Telemetry is off.

Zero dependencies. Apache-2.0. Node 20 or newer.

```bash
npm install @41prompts/sdk
```

```ts
import { createClient } from "@41prompts/sdk";

const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY });

const { status, text } = prompts.resolve("pr_1a2b3c4d", { customer_name: "Ada" });
if (status === "ok") {
  await model.complete(text);
}
```

## How a call is answered

`resolve()` is synchronous and looks in three places, in order:

| | |
|---|---|
| **memory** | what this process has already fetched |
| **disk** | what this machine fetched before the process restarted |
| **bundled** | builds shipped with your deploy |

**The network is not the fourth place.** It is a background refresh that fills the first two. That is
what "never waits for the network" means, and it has one consequence worth knowing before you meet
it: **the very first `resolve()` in a fresh process with no disk cache and nothing bundled
returns `status: "unavailable"` and an empty string.** A moment later it will not.

Two ways to be ready at start-up, and you can use both:

```ts
// Wait once, where waiting is allowed — in your own start-up, not in a request.
await prompts.refresh();

// Or ship the builds with the deploy, so the first request is right on a cold machine.
import bundled from "./prompts/builds.json" with { type: "json" };
const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY, bundled });
```

Once a prompt is held, a new Live version reaches this process within about thirty seconds — without
a redeploy and without a restart.

## It never throws

Every failure — offline, a refused key, a prompt that was never published, a corrupt cache file, a
response that is not what it claimed to be — is a `ResolveResult` you can read and a `Warning` you
can log:

```ts
const prompts = createClient({
  apiKey: process.env.FORTYONE_API_KEY,
  onWarning: (warning) => logger.warn({ code: warning.code, promptId: warning.promptId }, warning.message),
});
```

With no `onWarning`, the SDK writes **one line per distinct problem** to `console.warn` and then goes
quiet about it. Pass a handler and it says nothing on its own.

`status` is the field to branch on. `"unavailable"` means `text` is `""`; it is never a degraded
answer to send anyway.

## Variables

The build declares which variables a prompt takes and which have defaults.

```ts
const result = prompts.resolve("pr_1a2b3c4d", { customer_name: "Ada" });

result.status;       // "ok"
result.usedDefaults; // ["tone"] — declared with a default, and you did not supply one
result.missing;      // [] — names with no value and no default
```

A missing required variable is **refused**, not filled with an empty string: `status` is
`"unavailable"` and `missing` names it. Sending a model a prompt with `{{customer_name}}` still in it
produces a confident answer about a customer called "customer_name", and nobody notices for a week.

A value is inserted verbatim and never re-scanned, so a support transcript that happens to contain
`{{something}}` stays a transcript.

## What is verified before a prompt reaches you

Every build this SDK serves has been checked twice:

1. **It hashes to its own content address** — the document is intact and unaltered.
2. **That address is the one the Live marker names** — it is the build that is Live, not a correct one
   from last week that a cache still holds.

A failure is refused, warned about, and the SDK falls back to what it already had. A document from a
format version this SDK is too old to read is refused the same way, with a warning that says to
upgrade.

## Telemetry

**Off.** Nothing is sent about you, your prompts, your variables or your traffic.

Turned on with `telemetry: true`, the SDK adds **one header** to the background request it was
already making, and makes no request of its own:

```
41p-client: ts/0.1.0/node22/3f5b9c31-0a44-4d6e-9f11-2a7c8e4d6b01
```

Four parts, and that is the whole of it:

| part | what it is |
|---|---|
| `ts` | which SDK — TypeScript rather than Python |
| `0.1.0` | this package's version |
| `node22` | the major version of Node |
| the UUID | a random install id, generated on first use and written next to the cache |

The install id is not derived from anything: not a hostname, not a machine id, not an environment
variable, not your account. Delete the `install-id` file in the cache directory and a new one is
generated. Nothing about a prompt, a value or a response is ever sent.

## Options

```ts
createClient({
  apiKey,      // 41p_live_… or 41p_test_… — defaults to process.env.FORTYONE_API_KEY
  baseUrl,     // defaults to https://app.41prompts.ai
  bundled,     // build documents shipped with your deploy
  cacheDir,    // defaults to <tmpdir>/41prompts-sdk; null turns the disk cache off
  refreshMs,   // how often to check what is Live; defaults to 30000
  jitter,      // how much to spread that over, 0 to 1; defaults to 0.25
  telemetry,   // defaults to false
  onWarning,   // called instead of console.warn
});
```

The client is meant to live as long as your process. One per application, not one per request.
`close()` stops the refresh timer; the timer never keeps a process alive on its own.

## Zero dependencies, and what that means here

`npm install @41prompts/sdk` installs one package with nothing behind it — no `dependencies`, no
`peerDependencies`, no `optionalDependencies`. The hashing and the variable binding come from
`@41prompts/core`, which is compiled into this package at build time rather than installed alongside
it, so there is exactly one implementation of each and none of it reaches your dependency tree.

## Licence

Apache-2.0.
