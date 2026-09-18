// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The published shapes of `@41prompts/sdk` (EPIC-052).
 *
 * **This module imports nothing.** That is not tidiness: `dist/index.d.ts` is what a customer's
 * TypeScript loads, and a type imported from `@41prompts/core` here would make the published
 * declarations depend on a package the published `dependencies` deliberately does not name.
 * `package.test.ts` walks the declaration closure and fails if one appears.
 *
 * `docs/decisions/ADR-006-sdk-public-api.md` is what freezes the surface these describe.
 */

/** Why the SDK is warning. A code rather than only a sentence, so a caller can route on it. */
export type WarningCode =
  /** No key, or no base URL, so the background refresh cannot run at all. */
  | "not_configured"
  /** The request did not complete: offline, DNS, TLS, timeout, connection refused. */
  | "network"
  /** The key was refused (401) or is scoped to another project (403). */
  | "unauthorised"
  /** The prompt is unknown, or nothing has ever been published for it (404). */
  | "not_found"
  /** A response arrived and was not the document it claimed to be. */
  | "malformed"
  /** `schemaVersion` names a format this reader was written before. ADR-005 §3. */
  | "unknown_version"
  /** The artifact does not hash to the address it was fetched under, or to the one that is Live. */
  | "hash_mismatch"
  /** The disk cache could not be read or written. Never fatal; memory and bundled still work. */
  | "disk"
  /** `resolve()` was called without a value for a variable that has no default. */
  | "missing_variables";

/**
 * Something went wrong and the call did not throw.
 *
 * `CLAUDE.md` rule 8: the SDK never throws. Every failure that would have been an exception arrives
 * here instead, and `message` is written to be readable in a log with no other context around it.
 */
export interface Warning {
  readonly code: WarningCode;
  readonly message: string;
  /** The prompt the warning is about, where there is one. */
  readonly promptId?: string;
}

/** Where the answer came from. Never `"network"` — see `resolve`'s own documentation. */
export type ResolveSource = "memory" | "disk" | "bundled" | "none";

/**
 * What a `resolve()` call returns. Always this shape, whatever went wrong.
 *
 * `status` is the one field a caller must read. `"unavailable"` means `text` is `""` and sending it
 * to a model would send an empty prompt — it is never a degraded answer to be used anyway.
 */
export interface ResolveResult {
  readonly status: "ok" | "unavailable";
  /** The compiled prompt with variables bound, or `""` when `status` is `"unavailable"`. */
  readonly text: string;
  readonly source: ResolveSource;
  readonly promptId: string;
  /** The N a person reads as "Live vN", or `null` when nothing was resolved. */
  readonly version: number | null;
  /** The artifact's content address, or `null`. */
  readonly buildHash: string | null;
  /** The model the checks were proved against — not a model you must use. `null` when unresolved. */
  readonly model: string | null;
  /** Declared variables with no supplied value and no default. Empty when `status` is `"ok"`. */
  readonly missing: readonly string[];
  /** Declared variables that fell back to their default, in the order they appear in the text. */
  readonly usedDefaults: readonly string[];
}

/** The subset of a `fetch` response this package reads. `globalThis.fetch` satisfies it. */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/**
 * The subset of `fetch` this package calls.
 *
 * Structural rather than `typeof globalThis.fetch` for two reasons: the published declarations stay
 * free of `@types/node` and `lib.dom`, and a test can pass a counting stub without constructing a
 * `Response`. Nothing in this package's own suite is allowed to reach the network.
 */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<FetchResponse>;

/** How a client is built. Every field has a default; `apiKey` falls back to `FORTYONE_API_KEY`. */
export interface ClientOptions {
  /** `41p_live_…` or `41p_test_…`. Defaults to `process.env.FORTYONE_API_KEY`. */
  readonly apiKey?: string;
  /** Where `/v1` lives. Defaults to `https://app.41prompts.ai`. */
  readonly baseUrl?: string;
  /**
   * Artifact documents shipped with the deploy — the answer when there is no cache and no network.
   *
   * Anything that is not a valid artifact is dropped with a warning rather than refused, because a
   * bad entry in a bundled file must not take out the entries next to it.
   */
  readonly bundled?: readonly unknown[];
  /**
   * Where the disk cache lives. `null` turns it off — for a read-only filesystem, or a process that
   * would rather hold everything in memory. Defaults to `<tmpdir>/41prompts-sdk`.
   */
  readonly cacheDir?: string | null;
  /** How often the background refresh runs, in milliseconds. Defaults to 30,000 — the marker's own max-age. */
  readonly refreshMs?: number;
  /**
   * How much of `refreshMs` to spread the refresh over, 0 to 1. Defaults to 0.25.
   *
   * A thousand processes that started from one deploy would otherwise ask at the same instant for
   * ever. The jitter is applied to every interval, not only the first.
   */
  readonly jitter?: number;
  /**
   * Off by default (`CLAUDE.md` rule 8). When on, one header is added to a request the SDK was
   * already sending, and **no request is made that would not otherwise have been made**. The README
   * prints the exact header and names each of its four parts.
   */
  readonly telemetry?: boolean;
  /** Called for everything that would otherwise have been thrown. */
  readonly onWarning?: (warning: Warning) => void;
  /** Injected for tests. Defaults to `globalThis.fetch`. */
  readonly fetch?: FetchLike;
  /** Injected for tests. Defaults to `Date.now`. */
  readonly now?: () => number;
}

/** Per-call options. Separate from `ClientOptions` so one call can be warned about differently. */
export interface ResolveOptions {
  readonly onWarning?: (warning: Warning) => void;
}

/**
 * A configured client.
 *
 * Hold one for the lifetime of the process. Constructing one per request would start a refresh
 * timer per request and lose the memory cache between them, which is every property this package
 * exists for.
 */
export interface Client {
  /**
   * The Live prompt, with `vars` bound into it. **Synchronous, and never waits for the network.**
   */
  resolve(promptId: string, vars?: Readonly<Record<string, string>>, options?: ResolveOptions): ResolveResult;
  /**
   * Fetch now, and resolve when it is done.
   *
   * The one place waiting is allowed, because the caller asked. An application that wants to be warm
   * before it serves its first request awaits this once at start-up, **naming the prompt**.
   *
   * With no argument it refreshes every prompt the client has been asked for — which on a client
   * that has just been constructed is **none of them**, so a bare `refresh()` at start-up fetches
   * nothing. It cannot do otherwise: this package is never told which prompts an application will
   * use. EPIC-054's drive found the README, this package's own example and the Connect page all
   * printing the bare call as the way to be warm; the call is right and the instruction was wrong.
   */
  refresh(promptId?: string): Promise<void>;
  /** Stop the refresh timer. A client that is not closed keeps refreshing, but never holds the process open. */
  close(): void;
}
