// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The background fetch (EPIC-052).
 *
 * ## Two requests, and the second one usually does not happen
 *
 * 1. `GET /v1/marker/:promptId` — what is Live. Conditional on the `ETag` from last time, so the
 *    steady state is a 304 with no body.
 * 2. `GET /v1/build/:buildHash` — the artifact, **only when that hash is not already held**. An
 *    artifact is immutable and content-addressed, so a build we have is a build we never re-fetch.
 *
 * Both routes redirect to wherever the store puts the bytes. That is the point of them: the SDK
 * knows an identity and the server knows an address, and a reader that derived the address would be
 * carrying a copy of `lib/deploy/store.ts`'s key layout into every customer's `node_modules`. The
 * redirect is followed by `fetch`; `Authorization` is dropped by the runtime when it crosses an
 * origin, which is correct — an artifact is public (ADR-005 §1) and the CDN has no key to check.
 *
 * ## Nothing here throws, and a timeout is not an exception either
 *
 * Every failure becomes a `Warning` the caller is handed. A request that never answers is aborted
 * rather than raced, so the socket goes with it — a raced promise releases the lock and leaves the
 * connection, and a process that does that once a minute for a day has a problem it cannot see.
 */

import type { Entry } from "./entry.js";
import type { FetchLike, FetchResponse, Warning } from "./types.js";
import { readArtifact, readMarker } from "./verify.js";

export interface NetworkConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
  /** The one telemetry header, or undefined when telemetry is off — which is the default. */
  readonly clientHeader?: string;
}

export type FetchOutcome =
  /** A 304. The Live marker has not moved and no body was transferred. */
  | { readonly kind: "unchanged" }
  /**
   * The marker was read and names a build already held.
   *
   * Its own outcome rather than a second `unchanged`, because the marker facts **did** arrive and
   * throwing them away would leave the client re-requesting unconditionally for ever: a lost `ETag`
   * would never be replaced, and a rollback to a build still in memory would keep reporting the
   * version it rolled back from.
   */
  | {
      readonly kind: "marker";
      readonly version: number;
      readonly publishedAt: string;
      readonly etag: string | null;
    }
  /** A new Live build. `artifactText` is the bytes as they arrived, for the disk cache to store. */
  | { readonly kind: "entry"; readonly entry: Entry; readonly artifactText: string }
  | { readonly kind: "warning"; readonly warning: Warning };

function headers(config: NetworkConfig, etag: string | null): Record<string, string> {
  const out: Record<string, string> = { authorization: `Bearer ${config.apiKey}`, accept: "application/json" };
  if (etag !== null) out["if-none-match"] = etag;
  // Off by default (`CLAUDE.md` rule 8). When on it rides a request that was happening anyway; this
  // package never sends a request of its own to report anything.
  if (config.clientHeader !== undefined) out["41p-client"] = config.clientHeader;
  return out;
}

function failure(status: number, what: string, promptId: string): Warning {
  if (status === 401) {
    return { code: "unauthorised", message: `the API key was refused while fetching the ${what}`, promptId };
  }
  if (status === 403) {
    return { code: "unauthorised", message: `the API key is scoped to another project`, promptId };
  }
  if (status === 404) {
    return { code: "not_found", message: `nothing is published for this prompt`, promptId };
  }
  return { code: "network", message: `the ${what} request answered ${status}`, promptId };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function get(
  config: NetworkConfig,
  url: string,
  etag: string | null,
): Promise<{ ok: true; response: FetchResponse } | { ok: false; message: string }> {
  // `AbortSignal.timeout` rather than a raced promise: the request is cancelled, not abandoned.
  const signal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(config.timeoutMs) : undefined;
  try {
    const response = await config.fetch(url, { headers: headers(config, etag), ...(signal ? { signal } : {}) });
    return { ok: true, response };
  } catch (error) {
    return { ok: false, message: messageOf(error) };
  }
}

/**
 * Fetch what is Live for one prompt.
 *
 * `held` is the build hash already in memory, so an unchanged marker with a lost `ETag` still costs
 * one request rather than two.
 */
export async function fetchLive(
  config: NetworkConfig,
  promptId: string,
  etag: string | null,
  held: string | null,
): Promise<FetchOutcome> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const markerUrl = `${base}/v1/marker/${encodeURIComponent(promptId)}`;

  const markerGet = await get(config, markerUrl, etag);
  if (!markerGet.ok) {
    return { kind: "warning", warning: { code: "network", message: markerGet.message, promptId } };
  }
  const markerResponse = markerGet.response;
  if (markerResponse.status === 304) return { kind: "unchanged" };
  if (!markerResponse.ok) {
    return { kind: "warning", warning: failure(markerResponse.status, "Live marker", promptId) };
  }

  let markerText: string;
  try {
    markerText = await markerResponse.text();
  } catch (error) {
    return { kind: "warning", warning: { code: "network", message: messageOf(error), promptId } };
  }

  const marker = readMarker(markerText);
  if (!marker.ok) return { kind: "warning", warning: { ...marker.warning, promptId } };
  if (marker.value.promptId !== promptId) {
    return {
      kind: "warning",
      warning: { code: "malformed", message: "the Live marker names a different prompt", promptId },
    };
  }

  const nextEtag = markerResponse.headers.get("etag");

  if (held !== null && held === marker.value.buildHash) {
    // The marker names the build we already hold — an undo back to it, or simply an `ETag` we lost.
    // Nothing to download; the caller keeps its artifact and takes the marker facts.
    return {
      kind: "marker",
      version: marker.value.version,
      publishedAt: marker.value.publishedAt,
      etag: nextEtag,
    };
  }

  const buildUrl = `${base}/v1/build/${encodeURIComponent(marker.value.buildHash)}`;
  const buildGet = await get(config, buildUrl, null);
  if (!buildGet.ok) {
    return { kind: "warning", warning: { code: "network", message: buildGet.message, promptId } };
  }
  if (!buildGet.response.ok) {
    return { kind: "warning", warning: failure(buildGet.response.status, "build", promptId) };
  }

  let artifactText: string;
  try {
    artifactText = await buildGet.response.text();
  } catch (error) {
    return { kind: "warning", warning: { code: "network", message: messageOf(error), promptId } };
  }

  // Both halves of the roadmap's "artifact sha verified against pointer": the document hashes to its
  // own address, and that address is the one the marker named.
  const artifact = readArtifact(artifactText, marker.value.buildHash);
  if (!artifact.ok) return { kind: "warning", warning: { ...artifact.warning, promptId } };

  return {
    kind: "entry",
    entry: {
      artifact: artifact.value,
      version: marker.value.version,
      publishedAt: marker.value.publishedAt,
      etag: nextEtag,
    },
    artifactText,
  };
}
