// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * argv in, exit code out (EPIC-053).
 *
 * ## `runCommand` returns; only `main` exits
 *
 * A test calls `runCommand` and reads the result. Nothing in this package calls `process.exit`
 * except `main`, which is the one function a test does not call — so a command cannot take the test
 * runner down with it, and an unexpected throw becomes a `2` with a sentence rather than a stack
 * trace in somebody's CI log.
 */

import { languageFlag, parseArgs, stringFlag, varsOf } from "./args.js";
import { check } from "./commands/check.js";
import { decompile } from "./commands/decompile.js";
import { link } from "./commands/link.js";
import { pull } from "./commands/pull.js";
import { run } from "./commands/run.js";
import { cannotAnswer, ok, type CommandResult } from "./exit.js";
import { HELP, isCommand } from "./help.js";
import { nodeEnv, type Env } from "./out.js";
import { getVersionOutput } from "./version.js";

export async function runCommand(env: Env, argv: readonly string[]): Promise<CommandResult> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return cannotAnswer([parsed.detail, "", ...HELP]);

  const { command, positional, flags } = parsed.args;

  if (flags.version === true) return ok([getVersionOutput()]);
  if (command === undefined || flags.help === true) return ok([...HELP]);

  if (!isCommand(command)) {
    return cannotAnswer([`41p has no command "${command}".`, "", ...HELP]);
  }

  const language = languageFlag(flags);
  if (!language.ok) return cannotAnswer([language.detail]);

  const shared = {
    key: stringFlag(flags, "key"),
    baseUrl: stringFlag(flags, "base-url"),
    out: stringFlag(flags, "out"),
  };

  try {
    switch (command) {
      case "link":
        return await link(env, { ...shared, lang: language.value });
      case "pull":
        return await pull(env, { ...shared, lang: language.value });
      case "check":
        return await check(env, shared);
      case "run":
        return await run(env, {
          promptId: positional[0],
          vars: varsOf(flags),
          json: flags.json === true,
          key: shared.key,
          baseUrl: shared.baseUrl,
        });
      case "decompile":
        return decompile(env, { file: positional[0] ?? stringFlag(flags, "file"), json: flags.json === true });
    }
  } catch (error) {
    // Nothing in a command is supposed to throw. If one does, a person gets a sentence and a `2`
    // rather than a stack trace — "the question could not be put" is exactly what an unexpected
    // failure is, and the detail is still there for a bug report.
    return cannotAnswer([
      `41p ${command} stopped unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

/** The process entry point. The only place an exit code becomes an exit. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<never> {
  const env = nodeEnv();
  const result = await runCommand(env, argv);
  if (result.raw !== undefined) env.write(result.raw);
  for (const line of result.out ?? []) env.stdout(line);
  for (const line of result.err ?? []) env.stderr(line);
  process.exit(result.code);
}
