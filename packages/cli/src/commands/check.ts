// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p check` — the command that runs in CI (EPIC-053 ruling 7).
 *
 * ## It answers one question and distinguishes it from being unable to
 *
 * *"Is what this repository generated still what is Live?"*
 *
 * - **`0`** — yes. The lockfile and `/v1` agree, and nobody has hand-edited the generated file.
 * - **`1`** — no, and here is what moved. A real answer, with an obvious fix: `41p pull`.
 * - **`2`** — the question could not be put. No `.41prc`, no key, a refused key, no network, a
 *   lockfile from a newer `41p`.
 *
 * **The separation of `1` from `2` is the whole point.** A build that fails identically for
 * *"somebody published a new version"* and *"this CI job has no credential"* teaches people to
 * ignore both — and one of those is a legitimate failure whose fix takes ten seconds while the other
 * is a broken pipeline. `exit.ts` carries the two times this project has already paid for confusing
 * them.
 *
 * ## The hand-edit check is reported separately, because it is not staleness
 *
 * `41p.lock.json` records the generated file's own hash. If the file on disk does not match it,
 * somebody edited what a command wrote — usually to fix a name — and the next `pull` will silently
 * revert it. That is worth saying, and it is a different problem with a different fix, so it gets
 * its own line rather than being folded into "stale".
 */

import { apiFor } from "../api.js";
import { baseUrlFor, keyFromEnvironment, readConfig, type Config } from "../config.js";
import { answeredNo, cannotAnswer, ok, type CommandResult } from "../exit.js";
import {
  LOCKFILE_FILENAME,
  hashOfGeneratedFile,
  readLockfile,
  stalenessAgainst,
  stalenessLine,
} from "../lockfile.js";
import type { Env } from "../out.js";

export interface CheckArgs {
  readonly key?: string;
  readonly baseUrl?: string;
  readonly out?: string;
}

export async function check(env: Env, args: CheckArgs): Promise<CommandResult> {
  const config = readConfig(env);
  if (!config.ok && config.reason === "malformed") return cannotAnswer([`${config.detail}.`]);
  const settings: Config | undefined = config.ok ? config.config : undefined;
  const out = args.out ?? settings?.out ?? ".";

  const lockfile = readLockfile(env.readFile(join(out, LOCKFILE_FILENAME)));
  if (!lockfile.ok) {
    return cannotAnswer([
      `${lockfile.detail}.`,
      ...(lockfile.reason === "absent" ? ["  Run 41p pull first."] : []),
    ]);
  }

  const key = keyFromEnvironment(env, args.key);
  if (key === undefined) {
    return cannotAnswer([
      "No API key. Set FORTYONE_API_KEY or pass --key.",
      "  This is a configuration problem, not a stale lockfile — 41p check exits 2 for it.",
    ]);
  }

  const baseUrl = baseUrlFor(env, settings, args.baseUrl);
  const listed = await apiFor({ baseUrl, apiKey: key, fetch: env.fetch }).prompts();
  if (!listed.ok) {
    return cannotAnswer([
      `Could not read ${baseUrl}/v1/prompts: ${listed.detail}.`,
      "  Nothing is known about whether your prompts moved.",
    ]);
  }

  const stale = stalenessAgainst(lockfile.lockfile, listed.value.prompts);

  // A hand-edit is checked even when the lockfile is current, because it is the case where
  // everything else looks fine and the file on disk is not what any command wrote.
  const onDisk = env.readFile(join(out, lockfile.lockfile.file));
  const edited =
    lockfile.lockfile.generated.length > 0 &&
    onDisk !== undefined &&
    hashOfGeneratedFile(onDisk) !== lockfile.lockfile.generated;
  const missing = onDisk === undefined;

  if (stale.length === 0 && !edited && !missing) {
    return ok([
      `Current. ${count(lockfile.lockfile.prompts.length, "prompt")}, all at the version you pulled.`,
      `  ${baseUrl} (${listed.value.environment})`,
    ]);
  }

  const lines: string[] = [];
  if (stale.length > 0) {
    lines.push(`Stale. ${count(stale.length, "prompt")} ${stale.length === 1 ? "has" : "have"} moved since 41p pull:`);
    for (const entry of stale) lines.push(stalenessLine(entry));
  }
  if (missing) {
    lines.push(`${join(out, lockfile.lockfile.file)} is missing. The lockfile says it should be there.`);
  } else if (edited) {
    lines.push(
      `${join(out, lockfile.lockfile.file)} has been edited by hand since it was generated.`,
      "  The next 41p pull will overwrite it.",
    );
  }
  lines.push("", "Run 41p pull.");
  return answeredNo(lines);
}

const join = (out: string, path: string): string =>
  out === "." || out === "" ? path : `${out.replace(/\/+$/, "")}/${path}`;

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
