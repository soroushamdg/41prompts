// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p run` — what your program would send (EPIC-053 ruling 4).
 *
 * ## It does not call a model, and that is a narrowing of the roadmap's word
 *
 * `docs/roadmap.md` lists `run` among this epic's commands without saying what it runs. **This does
 * not execute a prompt against a provider**, and the reason is structural rather than a shortcut:
 *
 * - `/v1` has four routes — `prompts`, `marker`, `build`, `blob` — and none of them runs anything.
 *   `/api/prompts/*` is session-authenticated and belongs to the browser.
 * - Adding a public, key-authenticated run endpoint means spending somebody's money through a
 *   credential designed for reads, with rate limiting, quota and abuse handling behind it. That is
 *   an epic, not a task inside this one.
 * - Calling a provider from here would put model traffic in a public zero-dependency package and
 *   duplicate `apps/worker`'s adapters, which `CLAUDE.md` keeps proprietary and in the worker.
 *
 * ## What is left is the question nothing else answers
 *
 * *"What exactly is my program sending?"* — the compiled prompt, at the version that is Live now,
 * with these variables bound, including the defaults that filled themselves in. Somebody debugging
 * a bad answer needs the bytes, and until now the only way to see them was the database.
 *
 * The output says a model was not called, on stderr, so that stdout stays pipeable — `41p run x
 * --var a=b > prompt.txt` is a thing people will do and the note must not land in the file.
 */

import { bindVariables, type Artifact } from "@41prompts/core";
import { apiFor } from "../api.js";
import { baseUrlFor, keyFromEnvironment, readConfig, type Config } from "../config.js";
import { answeredNo, cannotAnswer, ok, type CommandResult } from "../exit.js";
import type { Env } from "../out.js";

/** Ruling 4's sentence. Asserted as a literal, because an unstated narrowing is the thing being avoided. */
export const NO_MODEL_NOTE = "This is the prompt your program would send. No model was called.";

export interface RunArgs {
  readonly promptId?: string;
  readonly vars?: ReadonlyMap<string, string>;
  readonly json?: boolean;
  readonly key?: string;
  readonly baseUrl?: string;
}

export async function run(env: Env, args: RunArgs): Promise<CommandResult> {
  if (args.promptId === undefined || args.promptId.length === 0) {
    return cannotAnswer(["41p run <promptId> [--var name=value] — name the prompt."]);
  }

  const config = readConfig(env);
  if (!config.ok && config.reason === "malformed") return cannotAnswer([`${config.detail}.`]);
  const settings: Config | undefined = config.ok ? config.config : undefined;

  const key = keyFromEnvironment(env, args.key);
  if (key === undefined) {
    return cannotAnswer(["No API key. Set FORTYONE_API_KEY or pass --key."]);
  }

  const baseUrl = baseUrlFor(env, settings, args.baseUrl);
  const api = apiFor({ baseUrl, apiKey: key, fetch: env.fetch });

  const listed = await api.prompts();
  if (!listed.ok) return cannotAnswer([`Could not read ${baseUrl}/v1/prompts: ${listed.detail}.`]);

  const prompt = listed.value.prompts.find((row) => row.id === args.promptId);
  if (prompt === undefined) {
    return cannotAnswer([
      `This key cannot see ${args.promptId}.`,
      "  A key is scoped to one project. 41p pull lists what it can see.",
    ]);
  }
  if (prompt.live === null) {
    // A real answer about the prompt, not a failure to ask: it exists, it is simply not Live.
    return answeredNo([`${prompt.name} (${prompt.id}) has nothing Live. Publish it on the Deploy page.`]);
  }

  const build = await api.build(prompt.live.buildHash);
  if (!build.ok) return cannotAnswer([`Could not read the build: ${build.detail}.`]);

  const document: Artifact = build.value;
  const bound = bindVariables(document.text, args.vars ?? new Map(), document.variables);

  if (!bound.ok) {
    return answeredNo([
      `Missing ${bound.missing.length === 1 ? "a value" : "values"} for: ${bound.missing.join(", ")}.`,
      `  Pass ${bound.missing.map((name) => `--var ${name}=…`).join(" ")}`,
    ]);
  }

  if (args.json === true) {
    return ok([
      JSON.stringify(
        {
          promptId: prompt.id,
          version: prompt.live.version,
          buildHash: prompt.live.buildHash,
          model: document.model,
          text: bound.text,
          usedDefaults: bound.usedDefaults,
          calledModel: false,
        },
        null,
        2,
      ),
    ]);
  }

  const note = [
    `${prompt.name} · Live v${prompt.live.version} · proved against ${document.model}`,
    ...(bound.usedDefaults.length > 0
      ? [`Used the declared default for: ${bound.usedDefaults.join(", ")}.`]
      : []),
    NO_MODEL_NOTE,
  ];
  // `raw`, not `out`: the prompt's own bytes, with nothing added. See `exit.ts`.
  return { code: 0, raw: bound.text, err: note };
}
