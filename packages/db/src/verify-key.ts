import type { ProviderName } from "./constants";

/**
 * Is this provider key real, and does it still work?
 *
 * ## Why this is in `packages/db` and not in either app
 *
 * `apps/web` has to answer it **before** it seals a key, so that a key the provider rejects is
 * never stored. `apps/worker` has to answer it about a key that is **already** sealed, because it
 * is the only process that may open one (threat model row `043a`). Neither app may import the
 * other, `packages/core` may not do IO by rule, and a second copy of this file would go stale
 * silently — which is the whole of `docs/PROCESS.md`'s note on `apps/web/e2e/env.mjs`.
 *
 * So it lives beside the key store it is about, in the one package both processes already depend
 * on. It uses Node 22's own `fetch` and adds no dependency.
 *
 * ## It is a models-list call, not a completion
 *
 * It costs no tokens, it is the same question at all three providers, and it needs no model id — so
 * it cannot fail for a reason that is about a model rather than about the key. A "test" that sent a
 * one-token completion would charge somebody for being careful.
 *
 * ## The key never reaches a URL
 *
 * Google's endpoint accepts `?key=`, and **that is the shape to avoid**: a `detail` built from a
 * failing request's URL would carry the key into an error message, a log line and a database column
 * in one step. All three providers take the credential in a header here, and every `detail` this
 * module returns is passed through the caller's scrubber as well.
 */

export type KeyRefusal =
  /** The provider said this key is not one of theirs, or is revoked. The person can act on it. */
  | "rejected"
  /** The key is real and is not allowed to do this. Usually a restricted or wrong-project key. */
  | "forbidden"
  /** We could not reach the provider at all. Says nothing about the key. */
  | "unreachable"
  /** The provider answered with something that is neither a yes nor a no about the key. */
  | "provider_error";

export type KeyVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: KeyRefusal; readonly detail: string };

/** Injectable so every test runs offline. Nothing in this repository's tests calls a provider. */
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

interface Probe {
  readonly url: string;
  readonly headers: (key: string) => Record<string, string>;
}

/**
 * Where each provider answers "is this key real".
 *
 * Every one is the cheapest authenticated `GET` the provider has, asked for the smallest page it
 * will return, because the answer we want is the status code and not the body.
 */
const PROBES: Readonly<Record<ProviderName, Probe>> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models?limit=1",
    headers: (key) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" }),
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key) => ({ authorization: `Bearer ${key}` }),
  },
  google: {
    // **The header, never `?key=`.** See the note at the top of this file.
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    headers: (key) => ({ "x-goog-api-key": key }),
  },
};

/** How long a probe may take. A person is waiting on this with a form open. */
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * The words a person reads, per refusal, with the provider named.
 *
 * **The provider is named in every one**, because the whole point of the message is to send somebody
 * to the right console. "That key was rejected" with no name is a sentence they cannot act on when
 * they have three keys open in three tabs.
 */
export function refusalWords(provider: ProviderName, reason: KeyRefusal, title: string): string {
  switch (reason) {
    case "rejected":
      return `${title} did not recognise that key. Nothing was saved. Check you copied the whole of it, and that it has not been revoked.`;
    case "forbidden":
      return `${title} recognised that key but refused it. Nothing was saved. It is usually a key restricted to other endpoints, or one belonging to a project without API access.`;
    case "unreachable":
      return `We could not reach ${title} just now, so we did not find out whether that key works. Nothing was saved. Try again in a moment.`;
    case "provider_error":
      return `${title} answered with something we could not read, so we did not find out whether that key works. Nothing was saved.`;
  }
}

/**
 * Ask the provider.
 *
 * ## What each status means, and why `429` is not a rejection
 *
 * `401`/`403` are about the key. **`429` is about the account's rate limit and proves the key is
 * real** — refusing to store a key because the person is busy would be an answer that is exactly
 * backwards. It is treated as a pass, and the report says so.
 *
 * `5xx` and a thrown `fetch` are `unreachable`: they say nothing at all about the key, and storing
 * on them would be as wrong as refusing on them. Nothing is stored either way; the person is asked
 * to try again.
 */
export async function verifyProviderKey(
  provider: ProviderName,
  plaintext: string,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  timeoutMs: number = VERIFY_TIMEOUT_MS,
): Promise<KeyVerdict> {
  const key = plaintext.trim();
  if (key.length < 8) {
    return { ok: false, reason: "rejected", detail: "shorter than eight characters" };
  }

  const probe = PROBES[provider];

  let status: number;
  let body: string;
  try {
    const response = await withTimeout(
      fetchImpl(probe.url, { method: "GET", headers: probe.headers(key) }),
      timeoutMs,
    );
    status = response.status;
    // Bounded before anything else touches it: a provider that answers a failure with an HTML page
    // should not put a kilobyte of markup through a scrubber and into a column.
    body = (await response.text()).slice(0, 400);
  } catch (error) {
    return { ok: false, reason: "unreachable", detail: shortMessage(error) };
  }

  if (status >= 200 && status < 300) return { ok: true };
  // The key is real; the account is busy. See the note above.
  if (status === 429) return { ok: true };
  if (status === 401) return { ok: false, reason: "rejected", detail: summarise(status, body) };
  if (status === 403) return { ok: false, reason: "forbidden", detail: summarise(status, body) };
  // Google answers an invalid key with 400 and `API_KEY_INVALID`, not with 401.
  if (status === 400 && /api[_ ]?key/i.test(body)) {
    return { ok: false, reason: "rejected", detail: summarise(status, body) };
  }
  if (status >= 500) return { ok: false, reason: "unreachable", detail: summarise(status, body) };
  return { ok: false, reason: "provider_error", detail: summarise(status, body) };
}

/**
 * `fetch` with a deadline, without depending on `AbortSignal.timeout` reaching the injected impl.
 *
 * A race rather than an abort, deliberately: the injected `FetchLike` in a test has no signal to
 * abort, and a timeout that only works against the real `fetch` is a timeout that is never tested.
 * The losing request is left to finish and its result discarded, which is acceptable for a `GET`
 * that returns a page of model names.
 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`the provider did not answer within ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** One line: the status, and whatever the provider said, trimmed to something a row can hold. */
function summarise(status: number, body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat === "" ? `HTTP ${status}` : `HTTP ${status}: ${flat.slice(0, 200)}`;
}

function shortMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 200);
}

// ── The fake, and the three guards on it ──────────────────────────────────────────────────────
//
// **It is here, once, rather than in each process that verifies.** The first version of this epic
// put a fake in `apps/web` alone, on the reasoning that the web is where a person pastes a key. The
// e2e suite then made a **real HTTPS call to api.anthropic.com** with an invented key, from the
// worker's "test this stored key" job, and got a genuine 401 back — a test suite reaching a
// provider, which is exactly what the injectable `fetch` above exists to prevent. A seam in one of
// two callers is not a seam.
//
// The three guards are the ones `apps/worker`'s `providerFor` already has, because a test-only path
// in production code is the shape that goes wrong:
//
// 1. It is **off unless the flag is set**, and `FAKE_PROVIDER` appears nowhere in `infra/`.
// 2. It is **refused outright in production**, whatever the flag says.
// 3. It is **announced** — `usedFake` comes back with the verdict, and every caller logs it. A
//    process answering with a fake must never be quiet about it.

/**
 * What a key must start with, in fake mode, to be rejected.
 *
 * A marker rather than a length or a character class: every real key shape is a moving target, and
 * a fake that guessed at one would start refusing real keys the day a provider changed its prefix.
 * Nothing real begins with this.
 */
export const FAKE_REJECTED_PREFIX = "not-a-key-";

export interface VerifyEnv {
  readonly FAKE_PROVIDER?: string | undefined;
  readonly DEPLOY_ENV?: string | undefined;
  readonly [name: string]: string | undefined;
}

export function verificationIsFaked(env: VerifyEnv = process.env): boolean {
  return env.FAKE_PROVIDER === "1" && env.DEPLOY_ENV !== "production";
}

export interface VerifyOutcome {
  readonly verdict: KeyVerdict;
  /** Guard 3. The caller logs this; a fake that is not announced is a fake nobody can account for. */
  readonly usedFake: boolean;
}

/**
 * Ask the provider, or ask the fake — and say which.
 *
 * **Every caller in the product uses this, and none calls `verifyProviderKey` directly.** That is
 * the point: the seam is one function, so a third caller cannot be added without it.
 */
export async function verifyProviderKeyOrFake(
  provider: ProviderName,
  plaintext: string,
  options: { env?: VerifyEnv; fetchImpl?: FetchLike } = {},
): Promise<VerifyOutcome> {
  const env = options.env ?? process.env;
  if (verificationIsFaked(env)) {
    const key = plaintext.trim();
    const rejected = key.startsWith(FAKE_REJECTED_PREFIX) || key.length < 8;
    return {
      usedFake: true,
      verdict: rejected ? { ok: false, reason: "rejected", detail: "the fake verifier rejected it" } : { ok: true },
    };
  }
  return { usedFake: false, verdict: await verifyProviderKey(provider, plaintext, options.fetchImpl) };
}
