// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The `/v1` client (EPIC-053 ruling 5).
 *
 * ## Why this is not `@41prompts/sdk`
 *
 * `resolve()` is **synchronous** and answers from memory, disk or what the deploy bundled, while a
 * background timer refreshes. That is the right design for a server that runs for weeks
 * (`CLAUDE.md` rule 8, ADR-006) and the wrong one for a process that runs for 400ms and exits:
 * reaching the network on purpose is not something the SDK's public API offers, and ADR-006 froze
 * that API in EPIC-052. Widening it so a CLI could borrow it would be changing a published contract
 * to save a hundred lines here.
 *
 * ## But nothing about verification is reimplemented
 *
 * `buildHashOf`, `validate` and `ARTIFACT_JSON_SCHEMA` are already public in `@41prompts/core` and
 * are the same functions the SDK verifies with. What lives here is the HTTP — four URLs, a bearer
 * header, and the mapping from a status code to a sentence. `CLAUDE.md` rule 1: the part that must
 * be correct is shared, and the part that is plumbing is not.
 *
 * ## `fetch` is a parameter
 *
 * Same reason `FetchLike` exists in the SDK: a test passes a stub, and `decompile`'s test passes one
 * that **fails the test if it is called at all** — which is what turns "the open decompiler makes no
 * network request" from an assumption into an assertion with a positive control.
 */

import { ARTIFACT_JSON_SCHEMA, buildHashOf, validate, type Artifact } from "@41prompts/core";

/** The subset of `fetch` this package calls. Structural, so a test needs no `Response`. */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export const DEFAULT_BASE_URL = "https://app.41prompts.ai";

/** What a request came back as. Never an exception: every failure is one of these. */
export type ApiOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: ApiFailure; readonly detail: string };

/**
 * Why a request did not produce an answer.
 *
 * `refused` and `unreachable` are separated because they exit the same way but are read by a person
 * who has to fix different things — a key, or a network.
 */
export type ApiFailure = "refused" | "not_found" | "unreachable" | "malformed";

/** One prompt as `/v1/prompts` describes it. */
export interface LivePrompt {
  readonly id: string;
  readonly name: string;
  readonly live: { readonly buildHash: string; readonly version: number; readonly publishedAt: string } | null;
}

export interface Api {
  /** Every prompt the key can see, and what is Live for each. */
  readonly prompts: () => Promise<ApiOutcome<{ environment: string; prompts: LivePrompt[] }>>;
  /** One artifact by its content address, verified against that address before it is returned. */
  readonly build: (buildHash: string) => Promise<ApiOutcome<Artifact>>;
}

export function apiFor(options: { baseUrl: string; apiKey: string; fetch: FetchLike }): Api {
  const get = async (path: string): Promise<ApiOutcome<string>> => {
    const url = `${options.baseUrl.replace(/\/+$/, "")}${path}`;
    let response;
    try {
      response = await options.fetch(url, {
        headers: { authorization: `Bearer ${options.apiKey}`, accept: "application/json" },
      });
    } catch (error) {
      // Offline, DNS, TLS, timeout, connection refused — one category, because the fix is the same.
      return { ok: false, reason: "unreachable", detail: messageOf(error) };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "refused", detail: `the key was refused (${response.status})` };
    }
    if (response.status === 404) return { ok: false, reason: "not_found", detail: `${path} is unknown` };
    if (!response.ok) {
      return { ok: false, reason: "unreachable", detail: `${url} answered ${response.status}` };
    }
    try {
      return { ok: true, value: await response.text() };
    } catch (error) {
      return { ok: false, reason: "unreachable", detail: messageOf(error) };
    }
  };

  return {
    prompts: async () => {
      const body = await get("/v1/prompts");
      if (!body.ok) return body;
      const parsed = parseJson(body.value);
      if (!parsed.ok) return parsed;
      const document = parsed.value;
      if (!isRecord(document) || !Array.isArray(document.prompts)) {
        return { ok: false, reason: "malformed", detail: "/v1/prompts did not answer with a list of prompts" };
      }
      const prompts: LivePrompt[] = [];
      for (const row of document.prompts) {
        if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string") {
          return { ok: false, reason: "malformed", detail: "a prompt in /v1/prompts has no id or no name" };
        }
        prompts.push({ id: row.id, name: row.name, live: liveOf(row.live) });
      }
      return {
        ok: true,
        value: {
          environment: typeof document.environment === "string" ? document.environment : "unknown",
          prompts,
        },
      };
    },

    build: async (buildHash) => {
      const body = await get(`/v1/build/${encodeURIComponent(buildHash)}`);
      if (!body.ok) return body;

      // Verification, in core, against the address it was fetched under. A document that does not
      // hash to its own name is the substitution ADR-005 §1 exists to make impossible to miss.
      const parsed = parseJson(body.value);
      if (!parsed.ok) return parsed;
      const violations = validate(ARTIFACT_JSON_SCHEMA, parsed.value);
      if (violations.length > 0) {
        return { ok: false, reason: "malformed", detail: `${buildHash} is not a valid build: ${violations[0]!.message}` };
      }
      const artifact = parsed.value as unknown as Artifact;
      const actual = buildHashOf(artifact);
      if (actual !== buildHash) {
        return {
          ok: false,
          reason: "malformed",
          detail: `${buildHash} does not hash to its own address (got ${actual})`,
        };
      }
      return { ok: true, value: artifact };
    },
  };
}

const liveOf = (value: unknown): LivePrompt["live"] => {
  if (!isRecord(value)) return null;
  const { buildHash, version, publishedAt } = value;
  if (typeof buildHash !== "string" || typeof version !== "number") return null;
  return { buildHash, version, publishedAt: typeof publishedAt === "string" ? publishedAt : "" };
};

const parseJson = (text: string): ApiOutcome<unknown> => {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "malformed", detail: "the answer was not JSON" };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : "the request did not complete";
