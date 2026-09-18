# fortyone-prompts

Resolve a published 41Prompts prompt at runtime, from Python. Import name `fortyone`.
**Zero dependencies** — standard library only. Apache-2.0.

```bash
pip install fortyone-prompts
```

```python
import fortyone

result = fortyone.resolve("pr_1a2b3c4d", {"customer_name": "Ada"})
if result.status == "ok":
    answer = model.complete(result.text)
```

`41p pull --lang python` writes a typed function per prompt, so you call `refund_classifier(customer_name="Ada")`
instead of holding an id.

## Three rules, and they are the whole design

1. **`resolve()` never waits for the network.** It answers from memory, disk, or what your deploy
   bundled. The network is a background refresh that fills the first two.
2. **It never raises.** Everything that would have been an exception is a warning you are handed.
3. **Telemetry is off.** Turning it on adds one header to a request that was happening anyway. It
   never sends a request of its own.

**What rule 1 costs, said here rather than buried:** the first `resolve()` in a fresh process with no
disk cache and nothing bundled returns `status="unavailable"` and an empty string. There are two
answers, and which one you want depends on your deploy:

```python
import json, pathlib, fortyone

# Ship the builds with your deploy — `41p pull` writes them into 41p/builds/.
bundled = [json.loads(p.read_text()) for p in pathlib.Path("41p/builds").glob("*.json")]
fortyone.configure(bundled=bundled)
```

```python
client = fortyone.create_client()
# Name the prompt. With no argument it refreshes what has already been asked for, which on a client
# you have just built is nothing — so a bare `refresh()` at start-up fetches nothing at all.
client.refresh("pr_1a2b3c4d")
```

## Configuration

`FORTYONE_API_KEY` is read from the environment. `FORTYONE_BASE_URL` overrides the host, for a
self-hosted deployment or a test pointing at localhost; it defaults to `https://app.41prompts.ai`.

```python
client = fortyone.create_client(
    api_key=...,             # defaults to FORTYONE_API_KEY
    base_url=...,            # defaults to FORTYONE_BASE_URL
    bundled=[...],           # build documents shipped with the deploy
    cache_dir="/var/cache",  # None turns the disk cache off
    refresh_seconds=30.0,
    telemetry=False,
    on_warning=print,
)
```

## What you get back

`ResolveResult` is a frozen dataclass: `status`, `text`, `source`, `prompt_id`, `version`,
`build_hash`, `model`, `missing`, `used_defaults`.

**Read `status` first.** `"unavailable"` means `text` is `""`, and sending that to a model sends an
empty prompt. It is never a degraded answer to use anyway. A required variable you did not supply is
`"unavailable"` with the name in `missing` — deliberately, because the alternative is shipping
`{{customer_name}}` to a model, which produces a plausible answer about a customer called
"customer_name".

## Warnings

Nothing raises, so everything arrives as an `SdkWarning` with a `code` you can route on:
`not_configured`, `network`, `unauthorised`, `not_found`, `malformed`, `unknown_version`,
`hash_mismatch`, `disk`, `missing_variables`.

With no `on_warning`, each code is logged once through the `fortyone` logger.

## What is verified, and what that protects you from

A build is fetched over HTTP from a CDN with no session in front of it — deliberately; anything in a
build is public. So every document is checked twice before a single field is read:

1. **It hashes to its own address.** SHA-256 over a canonical encoding, re-derived here. Catches
   corruption and tampering.
2. **That address is the one the Live marker names.** Catches a document that is intact and is not
   the one that is Live: a stale CDN edge, a cache holding a real object from last week, a bucket
   serving another environment's builds.

A cached file is re-verified on the way out too, because a file on disk is not ours in any sense
that matters.

## Divergences from `@41prompts/sdk`

The two SDKs resolve the same builds and must produce the same prompt text from the same values.
Where they differ, the difference is here with its reason. `tests/test_divergence.py` fails when a
name in the TypeScript surface has no row.

| `@41prompts/sdk` | `fortyone` | why |
|---|---|---|
| `createClient` | `create_client` | PEP 8. Every name below is snake_case for the same reason and the rows do not repeat it. |
| `resolve` | `resolve` | Same name, same meaning. Takes `variables` where TypeScript takes `vars`, because `vars` is a built-in. |
| `configure` | `configure` | Same. Takes keyword arguments rather than an options object. |
| `Client` | `Client` | Same three methods. |
| `Client.refresh` | `Client.refresh` | **Waits** where TypeScript returns a Promise. A caller who wants it off the main thread has `threading` and `asyncio.to_thread`; a package that chose one for them would be choosing their concurrency model. |
| `Client.close` | `Client.close` | Same. Both are optional: the refresh runs on a daemon thread, so a script that resolves once still exits. |
| `ClientOptions` | *(keyword arguments)* | An options object is a TypeScript idiom. Python has keyword arguments with defaults, and a dataclass here would be a second thing to import for no gain. |
| `ResolveOptions` | `on_warning=` keyword | Same reason; there is one per-call option. |
| `ResolveResult` | `ResolveResult` | A **frozen dataclass**, not a `TypedDict`, so it reads `result.status` exactly as the TypeScript does — and cannot be mutated by the code that receives it. |
| `ResolveSource` | `ResolveSource` | A `Literal`; the four values are identical. |
| `WarningCode` | `WarningCode` | A `Literal`; the nine codes are identical. |
| `Warning` | **`SdkWarning`** | `Warning` is a built-in exception base class. A package that shadows it changes what `except Warning:` means in any module that does `from fortyone import *`. |
| *(inline `(warning: Warning) => void`)* | **`WarningHandler`** | An exported alias, where TypeScript writes the signature inline in two places. Python has no structural function type a reader can see at the call site, so the name is the documentation — and `on_warning: WarningHandler` type-checks where a bare `Callable` would not narrow. |
| `FetchLike` | `Http` | A callable taking `(url, headers, timeout_seconds)` and returning an `HttpResponse`. Not part of the public surface; injected by tests. |
| `FetchResponse` | `HttpResponse` | A frozen dataclass rather than a structural type, because Python has no structural typing that a test double satisfies by accident. |
| `apiKey`, `baseUrl`, `bundled`, `cacheDir`, `jitter`, `telemetry`, `onWarning` | `api_key`, `base_url`, `bundled`, `cache_dir`, `jitter`, `telemetry`, `on_warning` | Naming only. |
| `fetch`, `now` | `http`, `now` | Injected by tests in both. |
| `refreshMs` | **`refresh_seconds`** | JavaScript timers take milliseconds; `time.sleep`, `socket.settimeout` and `threading.Timer` all take seconds. Carrying `refresh_ms` across would make every Python caller multiply by a thousand to satisfy a convention from a language they are not using. The default is the same 30 s either way. |
| *(a 5 s timeout, not an option)* | `timeout_seconds` | Same units argument; exposed because `urllib` has no ambient default worth relying on. |
| `promptId`, `buildHash`, `usedDefaults` | `prompt_id`, `build_hash`, `used_defaults` | Naming only. |
| `status`, `text`, `source`, `version`, `model`, `missing` | same | Identical. |
| `console.warn`, once per code | `logging.getLogger("fortyone")`, once per code | A Python application configures logging centrally; a package that writes to stderr cannot be routed or quieted without monkeypatching. With nothing configured, `logging.lastResort` still puts it on stderr. |
| `41p-client: ts/<version>/node22/<id>` | `41p-client: py/<version>/python312/<id>` | Four parts, same order. |
| `String(value)` for a non-string variable | ECMA-262 rendering | `True` binds as `"true"` and `1.0` as `"1"`, not `"True"` and `"1.0"`. The same values must produce the same prompt in both SDKs, because the prompt is what a model reads. |
| *(none)* | **`Authorization` is dropped on a cross-origin redirect** | `fetch` does this; `urllib` does not, and `/v1/marker` redirects to a CDN. Without it the default transport would send your API key to somebody else's access log. |
| *(no limit on a response body)* | 16 MiB, refused rather than truncated | A truncated document would fail its content address and report as tampering, which means something entirely different to whoever reads the log. |
| `.d.ts` | **`py.typed`**, no `.pyi` | PEP 561 makes a stub file *override* the module's own annotations, so a stale `.pyi` silently wins over correct code. One copy, checked by `mypy --strict`. |

**Not a divergence, worth saying:** the disk cache is the same format in the same directory
(`<tmpdir>/41prompts-sdk`), so a container running both shares one warm cache. Each SDK's suite reads
a record the other one wrote.

## Licence

Apache-2.0. See `LICENSE` and `NOTICE`.
