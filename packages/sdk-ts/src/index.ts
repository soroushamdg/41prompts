// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `@41prompts/sdk` — resolve a published prompt at runtime.
 *
 * ```ts
 * import { createClient } from "@41prompts/sdk";
 *
 * const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY });
 * await prompts.refresh("pr_1a2b3c4d");           // optional: be warm before the first request
 *
 * const { status, text } = prompts.resolve("pr_1a2b3c4d", { customer_name: "Ada" });
 * if (status === "ok") await model.complete(text);
 * ```
 *
 * **Three rules, and they are the whole design** (`CLAUDE.md` rule 8):
 *
 * 1. `resolve()` never blocks on the network. It answers from memory, disk, or what the deploy
 *    bundled; the network is a background refresh that fills the first two.
 * 2. It never throws. Everything that would have been an exception is a `Warning`.
 * 3. Telemetry is off. When it is turned on it adds one header to a request that was happening
 *    anyway and never sends one of its own.
 *
 * **This surface is frozen** by `docs/decisions/ADR-006-sdk-public-api.md`. Three functions and the
 * types they name; everything else in the package is internal and may change in a patch release.
 * `frozen.test.ts` fails when a fourth export appears.
 */

export { configure, createClient, resolve } from "./client.js";

export type {
  Client,
  ClientOptions,
  FetchLike,
  FetchResponse,
  ResolveOptions,
  ResolveResult,
  ResolveSource,
  Warning,
  WarningCode,
} from "./types.js";
