// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * `41p pull` — the bindings, the lockfile and the bundled builds (EPIC-053).
 *
 * ## Three files, and each answers a different question
 *
 * - **`prompts.ts` or `prompts.py`** — how your code calls a prompt. Typed, committed, reviewable.
 * - **`41p.lock.json`** — what was Live when you pulled, so `41p check` can tell you when that
 *   stops being true. `lockfile.ts` has the argument for recording the past rather than the present.
 * - **`41p/builds/<buildHash>.json`** — the artifacts themselves, for `createClient({ bundled })`.
 *   This is the answer the SDK gives when there is no cache and no network, which on a cold start in
 *   a fresh container is the ordinary case rather than the disaster case.
 *
 * ## The signature is built from what the prompt *uses*
 *
 * Not from what it declares. `apps/web`'s Connect page learned this the hard way in EPIC-055 — a
 * prompt saying `{{customer_name}}` with nothing declaring it produced a function nobody could pass
 * the name to, and the model got a prompt with `{{customer_name}}` still in it. The same rule is
 * applied here to the artifact: used names from its compiled `text`, declared names from its
 * `variables`, and the union in name order.
 *
 * **One difference from the page, and it is correct.** The page reads the open draft; this reads
 * what is Live. A prompt edited since it was published therefore generates different bindings in the
 * two places — and `41p pull`'s answer is the one your program will actually be resolving.
 */

import {
  CODEGEN_FILENAME,
  isOptional,
  occurrencesInText,
  promptsFile,
  usedVariableNames,
  type Artifact,
  type CodegenPrompt,
  type CodegenVariable,
} from "@41prompts/core";
import { apiFor, type Api, type LivePrompt } from "../api.js";
import { baseUrlFor, keyFromEnvironment, readConfig, type Config } from "../config.js";
import { cannotAnswer, ok, type CommandResult } from "../exit.js";
import { LOCKFILE_FILENAME, LOCKFILE_VERSION, hashOfGeneratedFile, lockfileText, type LockedPrompt } from "../lockfile.js";
import type { Env } from "../out.js";

/** Where bundled builds land. A directory, because there is one file per build. */
export const BUNDLE_DIR = "41p/builds";

/** The sentence ruling 3 requires. Written once, asserted as a literal. */
export const PYTHON_RUNTIME_NOTE =
  "The Python runtime is EPIC-054: fortyone.resolve() returns unavailable until it ships.";

export interface PullArgs {
  readonly key?: string;
  readonly baseUrl?: string;
  readonly out?: string;
  readonly lang?: "typescript" | "python";
}

export async function pull(env: Env, args: PullArgs): Promise<CommandResult> {
  const config = readConfig(env);
  if (!config.ok && config.reason === "malformed") {
    return cannotAnswer([`${config.detail}.`]);
  }
  const settings: Config | undefined = config.ok ? config.config : undefined;

  const key = keyFromEnvironment(env, args.key);
  if (key === undefined) {
    return cannotAnswer([
      "No API key. Set FORTYONE_API_KEY or pass --key.",
      "  41p link once, and it will tell you what is missing.",
    ]);
  }

  const baseUrl = baseUrlFor(env, settings, args.baseUrl);
  const language = args.lang ?? settings?.language ?? "typescript";
  const out = args.out ?? settings?.out ?? ".";

  const api = apiFor({ baseUrl, apiKey: key, fetch: env.fetch });
  const listed = await api.prompts();
  if (!listed.ok) {
    return cannotAnswer([`Could not read ${baseUrl}/v1/prompts: ${listed.detail}.`]);
  }

  const withLive = listed.value.prompts.filter(hasLive);
  const rows: CodegenPrompt[] = [];
  const locked: LockedPrompt[] = [];
  const bundled: { path: string; contents: string }[] = [];

  for (const prompt of withLive) {
    const build = await api.build(prompt.live.buildHash);
    if (!build.ok) {
      // Stop rather than generate a partial file. A `prompts.ts` missing one function compiles, and
      // the missing one is discovered by a developer at run time — which is the worst of the three
      // places this could surface.
      return cannotAnswer([
        `Could not read the build for ${prompt.name} (${prompt.id}): ${build.detail}.`,
        "  Nothing was written.",
      ]);
    }
    rows.push(codegenRowFor(prompt, build.value));
    locked.push({ id: prompt.id, name: prompt.name, version: prompt.live.version, buildHash: prompt.live.buildHash });
    bundled.push({
      path: join(out, `${BUNDLE_DIR}/${prompt.live.buildHash}.json`),
      contents: `${JSON.stringify(build.value, null, 2)}\n`,
    });
  }

  // Name order, so two pulls of the same state write the same bytes and a diff shows a real change.
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const filename = CODEGEN_FILENAME[language];
  const generated = promptsFile(language, rows);
  const generatedPath = join(out, filename);

  env.writeFile(generatedPath, generated);
  for (const file of bundled) env.writeFile(file.path, file.contents);
  env.writeFile(
    join(out, LOCKFILE_FILENAME),
    lockfileText({
      lockfileVersion: LOCKFILE_VERSION,
      language,
      file: filename,
      generated: hashOfGeneratedFile(generated),
      prompts: locked,
    }),
  );

  const unpublished = listed.value.prompts.length - withLive.length;
  const lines = [
    `Pulled ${count(withLive.length, "prompt")} from ${baseUrl} (${listed.value.environment}).`,
    `  ${generatedPath}`,
    `  ${join(out, LOCKFILE_FILENAME)}`,
    `  ${join(out, BUNDLE_DIR)}/ — ${count(bundled.length, "build")} for createClient({ bundled })`,
  ];
  if (unpublished > 0) {
    // Not a failure. A prompt that has never been published has no build to generate against, and
    // saying so is how somebody finds out their new prompt is still a draft.
    lines.push(
      "",
      `${count(unpublished, "prompt")} ${unpublished === 1 ? "is" : "are"} not Live and ${unpublished === 1 ? "has" : "have"} no function here. Publish on the Deploy page.`,
    );
  }
  if (language === "python") {
    lines.push("", PYTHON_RUNTIME_NOTE);
  }
  return ok(lines);
}

type LivePromptWithBuild = LivePrompt & { live: NonNullable<LivePrompt["live"]> };
const hasLive = (prompt: LivePrompt): prompt is LivePromptWithBuild => prompt.live !== null;

/**
 * One build, as a row the generator understands.
 *
 * `occurrencesInText` wants a blok id and there is no blok here — the build's `text` is the whole
 * compiled prompt, already assembled. `"build"` is passed as the id and thrown away: only the names
 * are read. Keeping the argument honest rather than passing `""` means a future reader of a stack
 * trace sees where the occurrences came from.
 *
 * **`build`, not the word `packages/db`'s store also avoids.** `lib/deploy/store.ts` names its keys
 * `builds/` because a storage key reaches a customer's log, and ADR-003 keeps that noun out of what a
 * reader sees. A CLI's variable names end up inside its own output strings, so the same rule reaches
 * here — which is how `packages/cli/src` joining the forbidden-word roots found three of these.
 */
export function codegenRowFor(prompt: { id: string; name: string }, build: Artifact): CodegenPrompt {
  const declaredBy = new Map(build.variables.map((variable) => [variable.name, variable]));
  const used = usedVariableNames(occurrencesInText(build.text, "build"));
  // Declared-but-unused names stay in the signature: they are part of the contract the artifact
  // carries, and dropping one would make the file disagree with `isCompatible`.
  const names = [...new Set([...used, ...declaredBy.keys()])].sort();

  const variables: CodegenVariable[] = names.map((name) => {
    const declaration = declaredBy.get(name);
    return {
      name,
      optional: declaration !== undefined && isOptional(declaration),
      declared: declaration !== undefined,
    };
  });
  return { id: prompt.id, name: prompt.name, variables };
}

/** `.` means here. Anything else is a prefix. No `node:path` so the output is the same on Windows. */
const join = (out: string, path: string): string =>
  out === "." || out === "" ? path : `${out.replace(/\/+$/, "")}/${path}`;

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
