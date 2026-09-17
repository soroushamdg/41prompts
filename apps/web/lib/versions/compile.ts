import { compile, readSnapshotBloks, type Compiled, type KeptSpan, type PromptBlok, type SnapshotBlok } from "@41prompts/core";
import type { VersionRow } from "@41prompts/db";

/**
 * A version's frozen blok set, re-compiled (EPIC-040 wrote this inline; EPIC-051 needed a second
 * caller and extracted it rather than writing a third copy).
 *
 * **The bloks come from the snapshot, never from the `bloks` table.** That is the whole point of a
 * version: `abAction` runs Draft v3 and must run what Draft v3 *was*, and `publishVersion` publishes
 * what was proved rather than what is on screen.
 *
 * Returns undefined when the snapshot cannot be read — a row written by something that is not this
 * application, or corrupted. The callers turn that into a refusal that says so.
 */
export interface CompiledVersion {
  readonly bloks: readonly SnapshotBlok[];
  readonly promptBloks: readonly PromptBlok[];
  readonly compiled: Compiled;
}

export function compileVersion(version: VersionRow): CompiledVersion | undefined {
  const bloks = readSnapshotBloks(version.snapshot);
  if (bloks === undefined) return undefined;

  const promptBloks: PromptBlok[] = bloks.map((blok) => ({
    id: blok.id,
    kind: blok.kind,
    text: blok.text,
    order: blok.position,
  }));

  // A hand-edited span is part of what the version was, so it is replayed here. Without it the
  // compile would produce the text the compiler would have written rather than the text the person
  // shipped — which is a different prompt, and the one nobody ran.
  const keep = new Map<string, KeptSpan>();
  for (const blok of bloks) {
    if (blok.editedText !== null && blok.editedFromHash !== null) {
      keep.set(blok.id, { text: blok.editedText, hash: blok.editedFromHash });
    }
  }

  return { bloks, promptBloks, compiled: compile(promptBloks, { keep }) };
}
