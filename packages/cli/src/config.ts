// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `.41prc`, and where the key comes from (EPIC-053 ruling 8).
 *
 * ## The key is not in the file, and that is the whole design
 *
 * `.41prc` holds the base URL and nothing secret. **`41p link` never writes the key into it.**
 *
 * A credential in a file that looks like configuration is a credential that reaches a commit — it is
 * beside `package.json`, it has no extension anyone associates with secrets, and the first thing a
 * person does after `41p link` is `git add .`. This project has a threat model about exactly this
 * class of mistake (EPIC-043) and shipping a tool that creates one would be an odd way to honour it.
 *
 * So the key is resolved at every invocation, in this order:
 *
 * 1. `--key`, for a one-off and for CI systems that inject on the command line;
 * 2. `FORTYONE_API_KEY`, which is where it belongs and what `@41prompts/sdk` already reads;
 * 3. a question at the terminal — **`link` only**, and only when there is a terminal.
 *
 * `FORTYONE_API_KEY` and `FORTYONE_BASE_URL` are the SDK's own names (`CLAUDE.md`, Naming), so a
 * repository that has configured the SDK has already configured the CLI.
 */

import { DEFAULT_BASE_URL } from "./api.js";
import type { Env } from "./out.js";

export const CONFIG_FILENAME = ".41prc";

export interface Config {
  /** Where `/v1` lives. */
  readonly baseUrl: string;
  /**
   * What `41p pull` writes, relative to the config file.
   *
   * Recorded so that `pull` and `check` agree without either being told twice, and so a repository
   * that keeps generated code somewhere other than the root does not have to pass a flag in CI.
   */
  readonly out: string;
  /** `typescript` or `python`. The default a bare `41p pull` uses. */
  readonly language: "typescript" | "python";
}

export const DEFAULT_CONFIG: Config = {
  baseUrl: DEFAULT_BASE_URL,
  out: ".",
  language: "typescript",
};

export type ConfigRead =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly reason: "absent" | "malformed"; readonly detail: string };

export function readConfig(env: Env): ConfigRead {
  const raw = env.readFile(CONFIG_FILENAME);
  if (raw === undefined) {
    return { ok: false, reason: "absent", detail: `no ${CONFIG_FILENAME} here` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, reason: "malformed", detail: `${CONFIG_FILENAME} is not valid JSON` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "malformed", detail: `${CONFIG_FILENAME} is not an object` };
  }
  const record = parsed as Record<string, unknown>;
  const language = record.language === "python" ? "python" : "typescript";
  return {
    ok: true,
    config: {
      baseUrl: typeof record.baseUrl === "string" && record.baseUrl.length > 0 ? record.baseUrl : DEFAULT_CONFIG.baseUrl,
      out: typeof record.out === "string" && record.out.length > 0 ? record.out : DEFAULT_CONFIG.out,
      language,
    },
  };
}

/**
 * The file `41p link` writes.
 *
 * Two spaces and a trailing newline, because a person reads this in a diff. The comment a JSON file
 * cannot carry is in the README instead.
 */
export function configText(config: Config): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Where the key comes from, without asking. `link` adds the question on top of this. */
export function keyFromEnvironment(env: Env, flagKey?: string): string | undefined {
  const candidate = flagKey ?? env.vars.FORTYONE_API_KEY;
  return candidate !== undefined && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

/**
 * The base URL, with the same precedence the SDK uses: what was passed, then the environment, then
 * the default. `FORTYONE_BASE_URL` exists for a self-hosted deployment and for a test pointing at
 * localhost (`CLAUDE.md`, Naming).
 */
export function baseUrlFor(env: Env, config: Config | undefined, flagBaseUrl?: string): string {
  return flagBaseUrl ?? env.vars.FORTYONE_BASE_URL ?? config?.baseUrl ?? DEFAULT_BASE_URL;
}

/**
 * A key's environment, read from its own prefix.
 *
 * `41p_live_…` and `41p_test_…` are what `packages/db` mints. Shown by `link` so a person who pasted
 * the wrong one finds out immediately rather than after a build deploys against test data.
 *
 * **This is a second reader of that format and it cannot be the same function.** `packages/db` is
 * proprietary and `CLAUDE.md` rule 11 forbids a public package importing it, so the choice is a
 * matching implementation or no check at all. It matches deliberately — three underscore-separated
 * parts, the first `41p` — rather than the looser `startsWith` that would accept `41p_live_a_b`.
 *
 * What makes the duplication safe is that **nothing is granted on the strength of it**, which is the
 * same sentence `environmentOfPlaintext` carries: *"A claim, not an authority. The row is what
 * decides."* If the format changed, the worst this does is stop printing a reassurance. The
 * authority is `/v1`, which answers `refused` to a key the database does not like.
 */
export function environmentOfKey(key: string): "live" | "test" | undefined {
  const parts = key.split("_");
  if (parts.length !== 3 || parts[0] !== "41p") return undefined;
  return parts[1] === "live" || parts[1] === "test" ? parts[1] : undefined;
}
