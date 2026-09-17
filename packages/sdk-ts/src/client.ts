// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The client (EPIC-052) — the memory cache, the one-flight rule and the jittered refresh.
 *
 * ## `resolve()` is synchronous, and the network is not the fourth place it looks
 *
 * `CLAUDE.md` rule 8 says two things that look contradictory: the order is memory → disk → bundled
 * → network, and *"the SDK never blocks a call on the network"*. A call that fell through to a
 * network request would have blocked on it. `docs/roadmap.md`'s own task line resolves it —
 * *"memory → disk → bundled → **background** network"* — and that is what this is: the network
 * fills the first two, and is never in the call path.
 *
 * The consequence, stated so nobody has to discover it: **the first `resolve()` in a fresh process
 * with no disk cache and no bundled artifact returns nothing.** That is what "never blocks" costs.
 * `bundled` is the answer for a deploy that must be right from its first request, and `refresh()` is
 * the answer for an application that would rather wait once at start-up, where waiting is allowed.
 *
 * ## One in-flight request per prompt
 *
 * A thousand concurrent `resolve()` calls for a prompt nobody holds are a thousand cache misses, and
 * a thousand requests would be a self-inflicted outage on the first deploy of a busy service. The
 * in-flight map is the whole mechanism: the second caller awaits the first caller's promise.
 *
 * ## The timer is jittered, and it does not hold the process open
 *
 * A fleet started by one deploy has every process on the same clock. Without jitter they ask
 * together for ever, and the interval that was polite at one process is a spike at four hundred.
 * `unref()` means a script that resolves once and finishes still exits.
 */

import { indexBundled } from "./bundled.js";
import { defaultCacheDir, installId, readFromDisk, writeToDisk } from "./disk.js";
import type { Entry } from "./entry.js";
import { fetchLive, type NetworkConfig } from "./network.js";
import { resolveEntry, unresolved } from "./resolve.js";
import type { Client, ClientOptions, FetchLike, ResolveOptions, ResolveResult, Warning } from "./types.js";
import { DEFAULT_BASE_URL, SDK_VERSION } from "./version.js";

const DEFAULT_REFRESH_MS = 30_000;
const DEFAULT_JITTER = 0.25;
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * The default warning handler: `console.warn`, **once per code**, naming the option that replaces it.
 *
 * Silence was the alternative and it is worse. A key that is refused, a prompt that is not published
 * or a cache directory that cannot be written are each invisible to a caller who did not think to
 * pass a handler — and the symptom, an empty prompt, points nowhere near the cause. Once per code is
 * what keeps that from becoming a line a minute for the life of the process.
 */
function defaultWarner(): (warning: Warning) => void {
  const seen = new Set<string>();
  return (warning) => {
    if (seen.has(warning.code)) return;
    seen.add(warning.code);
    if (typeof console === "undefined") return;
    console.warn(
      `[@41prompts/sdk] ${warning.message}${warning.promptId === undefined ? "" : ` (${warning.promptId})`}` +
        ` — pass onWarning to handle this yourself; further "${warning.code}" warnings are not repeated`,
    );
  };
}

/** A handler a caller wrote can throw. That must not become this package throwing. */
function guard(handler: ((warning: Warning) => void) | undefined): (warning: Warning) => void {
  if (handler === undefined) return () => undefined;
  return (warning) => {
    try {
      handler(warning);
    } catch {
      // A warning about a failing warning handler would be the same call again.
    }
  };
}

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Read one option off whatever the caller passed.
 *
 * `createClient(null)` and `createClient(someProxy)` are both things a JavaScript caller does, and
 * `CLAUDE.md` rule 8's "never throws" covers the constructor as much as the call. `?.` handles null
 * and undefined; the `try` handles a proxy whose traps throw and a getter that fails. **Both were
 * found by `never-throws.test.ts` rather than by reading this file**, which is the argument for
 * fuzzing a surface whose promise is about untyped callers.
 */
function option(options: unknown, key: string): unknown {
  try {
    return (options as Record<string, unknown> | null | undefined)?.[key];
  } catch {
    return undefined;
  }
}

function optionalFunction(value: unknown): ((...args: never[]) => unknown) | undefined {
  return typeof value === "function" ? (value as (...args: never[]) => unknown) : undefined;
}

/** `tmpdir()` can throw in a sandbox with no temp directory. A client without a cache still works. */
function safeDefaultCacheDir(): string | null {
  try {
    return defaultCacheDir();
  } catch {
    return null;
  }
}

/** The environment, read defensively: this package may be bundled into something without one. */
function fromEnv(name: string): string | undefined {
  try {
    const value = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function nodeMajor(): string {
  const version = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node;
  return typeof version === "string" ? `node${version.split(".")[0] ?? "?"}` : "node?";
}

export function createClient(options: ClientOptions = {}): Client {
  // Every option is read through `option()`, never off `options` directly. See its comment.
  const givenWarner = optionalFunction(option(options, "onWarning")) as ((warning: Warning) => void) | undefined;
  const warn = givenWarner === undefined ? defaultWarner() : guard(givenWarner);
  const now = (optionalFunction(option(options, "now")) as (() => number) | undefined) ?? Date.now;
  const refreshMs = positive(option(options, "refreshMs"), DEFAULT_REFRESH_MS);
  const givenJitter = option(options, "jitter");
  const jitter =
    typeof givenJitter === "number" && Number.isFinite(givenJitter) && givenJitter >= 0 && givenJitter <= 1
      ? givenJitter
      : DEFAULT_JITTER;

  const givenCacheDir = option(options, "cacheDir");
  const cacheDir =
    givenCacheDir === null ? null : typeof givenCacheDir === "string" && givenCacheDir.length > 0 ? givenCacheDir : safeDefaultCacheDir();
  const bundled = indexBundled(option(options, "bundled"), warn);

  const memory = new Map<string, Entry>();
  const inFlight = new Map<string, Promise<void>>();
  const lastAttempt = new Map<string, number>();
  const wanted = new Set<string>();
  const diskChecked = new Set<string>();

  const givenKey = option(options, "apiKey");
  const apiKey = (typeof givenKey === "string" && givenKey.length > 0 ? givenKey : undefined) ?? fromEnv("FORTYONE_API_KEY");
  const givenBase = option(options, "baseUrl");
  const baseUrl =
    (typeof givenBase === "string" && givenBase.length > 0 ? givenBase : undefined) ??
    fromEnv("FORTYONE_BASE_URL") ??
    DEFAULT_BASE_URL;
  const fetchImpl: FetchLike | undefined =
    (optionalFunction(option(options, "fetch")) as FetchLike | undefined) ??
    (typeof globalThis.fetch === "function" ? (globalThis.fetch as unknown as FetchLike) : undefined);

  let clientHeader: string | undefined;
  if (option(options, "telemetry") === true) {
    const id = cacheDir === null ? undefined : installId(cacheDir);
    clientHeader = `ts/${SDK_VERSION}/${nodeMajor()}/${id ?? "anonymous"}`;
  }

  const network: NetworkConfig | undefined =
    apiKey === undefined || fetchImpl === undefined
      ? undefined
      : {
          baseUrl,
          apiKey,
          fetch: fetchImpl,
          timeoutMs: DEFAULT_TIMEOUT_MS,
          ...(clientHeader === undefined ? {} : { clientHeader }),
        };

  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let warnedUnconfigured = false;

  function fromDisk(promptId: string): Entry | undefined {
    if (cacheDir === null || diskChecked.has(promptId)) return undefined;
    diskChecked.add(promptId);
    return readFromDisk(cacheDir, promptId, warn);
  }

  async function fetchOnce(promptId: string): Promise<void> {
    if (network === undefined) {
      if (!warnedUnconfigured) {
        warnedUnconfigured = true;
        warn({
          code: "not_configured",
          message:
            apiKey === undefined
              ? "no API key: pass apiKey to createClient or set FORTYONE_API_KEY"
              : "no fetch implementation is available in this runtime",
          promptId,
        });
      }
      return;
    }

    const held = memory.get(promptId);
    const outcome = await fetchLive(network, promptId, held?.etag ?? null, held?.artifact.buildHash ?? null);

    if (outcome.kind === "warning") {
      warn(outcome.warning);
      return;
    }
    if (outcome.kind === "unchanged") return;
    if (outcome.kind === "marker") {
      if (held === undefined) return;
      memory.set(promptId, {
        ...held,
        version: outcome.version,
        publishedAt: outcome.publishedAt,
        etag: outcome.etag,
      });
      return;
    }

    // Memory first, then disk. A disk failure must never lose an artifact this process is holding.
    memory.set(promptId, outcome.entry);
    if (cacheDir !== null) writeToDisk(cacheDir, promptId, outcome.entry, outcome.artifactText, warn);
  }

  /** The one-flight rule. Everything that wants a fetch goes through here. */
  function kick(promptId: string): Promise<void> {
    const existing = inFlight.get(promptId);
    if (existing !== undefined) return existing;

    // Recorded *before* the await, so a thousand synchronous resolves in one tick see one attempt.
    lastAttempt.set(promptId, now());
    const running = fetchOnce(promptId)
      .catch((error: unknown) => {
        // `fetchOnce` is written not to reject. This is the backstop that keeps rule 8 true anyway.
        warn({ code: "network", message: `the refresh failed unexpectedly: ${String(error)}`, promptId });
      })
      .finally(() => {
        inFlight.delete(promptId);
      });
    inFlight.set(promptId, running);
    return running;
  }

  function schedule(): void {
    if (closed || timer !== undefined || network === undefined) return;
    const spread = refreshMs * jitter;
    const delay = refreshMs - spread / 2 + Math.random() * spread;
    timer = setTimeout(() => {
      timer = undefined;
      for (const promptId of wanted) void kick(promptId);
      schedule();
    }, delay);
    // A script that resolves once and finishes should exit, not wait for a refresh nobody wants.
    (timer as unknown as { unref?: () => void }).unref?.();
  }

  function resolve(promptId: string, vars?: unknown, callOptions?: ResolveOptions): ResolveResult {
    const callHandler = optionalFunction(option(callOptions, "onWarning")) as ((warning: Warning) => void) | undefined;
    const callWarn = callHandler === undefined ? warn : guard(callHandler);

    if (typeof promptId !== "string" || promptId.length === 0) {
      callWarn({ code: "not_found", message: "resolve() was called without a prompt id" });
      return unresolved(typeof promptId === "string" ? promptId : "");
    }

    wanted.add(promptId);
    schedule();

    let source: ResolveResult["source"] = "memory";
    let entry = memory.get(promptId);
    if (entry === undefined) {
      entry = fromDisk(promptId);
      if (entry !== undefined) {
        source = "disk";
        memory.set(promptId, entry);
      }
    }
    if (entry === undefined) {
      entry = bundled.get(promptId);
      if (entry !== undefined) source = "bundled";
    }

    // Stale, or never fetched. Fire and forget: this call is answered from what is already held.
    if (now() - (lastAttempt.get(promptId) ?? 0) >= refreshMs) void kick(promptId);

    if (entry === undefined) {
      callWarn({
        code: "not_found",
        message: "nothing is cached for this prompt yet; a refresh is running in the background",
        promptId,
      });
      return unresolved(promptId);
    }
    return resolveEntry(entry, source, promptId, vars, callWarn);
  }

  return {
    resolve,
    async refresh(promptId?: string): Promise<void> {
      if (typeof promptId === "string" && promptId.length > 0) {
        wanted.add(promptId);
        // Forced: a caller who asked for a refresh gets one whatever the staleness clock says. It
        // still joins an in-flight request rather than starting a second.
        await kick(promptId);
        return;
      }
      await Promise.all([...wanted].map((id) => kick(id)));
    },
    close(): void {
      closed = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

/**
 * The module-level `resolve()`, and the client behind it.
 *
 * `docs/roadmap.md` writes the API as `resolve()`, and a great many applications want exactly that:
 * one prompt id, one object of values, no object to hold. It is a lazily created client configured
 * from `FORTYONE_API_KEY` — and `configure()` is how an application that wants `bundled`, a cache
 * directory or a warning handler gets them without restructuring around a client it passes around.
 *
 * `configure()` replaces the default client and closes the one it replaces, so calling it twice does
 * not leave a timer running for a client nothing can reach.
 */
let defaultClient: Client | undefined;

export function configure(options: ClientOptions = {}): void {
  defaultClient?.close();
  defaultClient = createClient(options);
}

export function resolve(
  promptId: string,
  vars?: Readonly<Record<string, string>>,
  options?: ResolveOptions,
): ResolveResult {
  defaultClient ??= createClient();
  return defaultClient.resolve(promptId, vars, options);
}
