// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p link` — write `.41prc`, and prove the key works (EPIC-053 ruling 8).
 *
 * ## It never writes the key
 *
 * `.41prc` gets the base URL and the output settings. The key stays in `FORTYONE_API_KEY`, which is
 * where `@41prompts/sdk` already reads it from, so a repository configured for one is configured for
 * the other. `config.ts` has the argument; the short version is that a credential in a file beside
 * `package.json` is a credential in a commit.
 *
 * ## It refuses to ask a question nobody can see
 *
 * `docs/roadmap.md` says *"interactive, fail in CI"*, and the failure being named is a build that
 * hangs on a prompt no one is watching. So the key is taken from `--key`, then the environment, and
 * only then asked for — and only when `process.stdin.isTTY`. With no terminal and neither of the
 * first two, it exits `2` naming both non-interactive routes, and **does not read stdin at all**.
 *
 * ## It makes one request, on purpose
 *
 * A `link` that only wrote a file would report success for a key that cannot work, and the person
 * would find out at `pull` — one command later, with a different error, in a different place. So it
 * calls `/v1/prompts` and says what the key can see. That also settles which project the key is
 * scoped to, which is the roadmap's *"key scope"*: a key carries its project, so there is no project
 * to choose and nothing to get wrong.
 */

import { apiFor } from "../api.js";
import {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  baseUrlFor,
  configText,
  environmentOfKey,
  keyFromEnvironment,
  readConfig,
} from "../config.js";
import { cannotAnswer, ok, type CommandResult } from "../exit.js";
import type { Env } from "../out.js";

export interface LinkArgs {
  readonly key?: string;
  readonly baseUrl?: string;
  readonly out?: string;
  readonly lang?: "typescript" | "python";
}

export async function link(env: Env, args: LinkArgs): Promise<CommandResult> {
  let key = keyFromEnvironment(env, args.key);

  if (key === undefined) {
    if (!env.interactive) {
      return cannotAnswer([
        "No API key. 41p link needs one and there is no terminal to ask at.",
        "  Set FORTYONE_API_KEY, or pass --key.",
        "  Mint one in Settings → API keys.",
      ]);
    }
    const answered = await env.ask("API key (41p_live_… or 41p_test_…): ");
    if (answered.length === 0) return cannotAnswer(["No API key given."]);
    key = answered;
  }

  const environment = environmentOfKey(key);
  if (environment === undefined) {
    return cannotAnswer([
      "That does not look like a 41Prompts API key.",
      "  They start 41p_live_ or 41p_test_ and are shown once, when you mint them.",
    ]);
  }

  const existing = readConfig(env);
  const baseUrl = baseUrlFor(env, existing.ok ? existing.config : undefined, args.baseUrl);
  const config = {
    baseUrl,
    out: args.out ?? (existing.ok ? existing.config.out : DEFAULT_CONFIG.out),
    language: args.lang ?? (existing.ok ? existing.config.language : DEFAULT_CONFIG.language),
  };

  const answer = await apiFor({ baseUrl, apiKey: key, fetch: env.fetch }).prompts();
  if (!answer.ok) {
    // Nothing is written. A `.41prc` created beside a key that does not work is a file that makes
    // the next command's failure harder to read, not easier.
    return cannotAnswer([`Could not reach ${baseUrl} with that key: ${answer.detail}.`, ...adviceFor(answer.reason)]);
  }

  env.writeFile(CONFIG_FILENAME, configText(config));

  const live = answer.value.prompts.filter((prompt) => prompt.live !== null).length;
  return ok([
    `Linked. ${CONFIG_FILENAME} written.`,
    `  ${baseUrl} · ${environment} key · ${answer.value.prompts.length} prompt${answer.value.prompts.length === 1 ? "" : "s"}, ${live} Live.`,
    `  The key is not in ${CONFIG_FILENAME}. Keep it in FORTYONE_API_KEY.`,
    "",
    "Next: 41p pull",
  ]);
}

const adviceFor = (reason: string): string[] => {
  if (reason === "refused") return ["  The key was refused. Check it is not revoked, and that it is this project's."];
  if (reason === "unreachable") return ["  Check the URL and that this machine can reach it."];
  return [];
};
