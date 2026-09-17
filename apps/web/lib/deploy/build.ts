import {
  COMPILER_VERSION,
  artifactOf,
  type Artifact,
  type ArtifactParams,
  type ArtifactVariable,
} from "@41prompts/core";
import type { VersionRow } from "@41prompts/db";
import { compileVersion } from "@/lib/versions/compile";

/**
 * Assembling the v1 artifact for a version (EPIC-051).
 *
 * `packages/core/src/artifact/schema.ts` is frozen and on `CLAUDE.md`'s never-touch list. Everything
 * here is a **caller** of it: nothing in this file decides what an artifact is, only which version's
 * facts go into one.
 */

/** Why an artifact could not be assembled. A code; `apps/web`'s route writes the sentence. */
export type BuildRefusal =
  | { kind: "unreadable_snapshot" }
  /**
   * The version's frozen `compiledText` is not what a fresh compile of its own snapshot produces.
   *
   * **A refusal rather than a choice**, and the reason is what an artifact's proof means. A version's
   * `compiledText` was frozen under the compiler of its day and `suite_runs.promptText` is a copy of
   * it — the text the checks actually ran against. If today's compiler produces something else, then
   * publishing the fresh compile means publishing text nobody proved, and publishing the frozen text
   * means an artifact whose `compilerVersion` is a lie about the bytes beside it.
   *
   * There is a third option — publish the frozen text and record the old compiler version — and it
   * is rejected because the artifact also carries `spans`, which only a compile produces. The honest
   * answer is that this version needs running again under the current compiler, and that is what the
   * refusal says.
   */
  | { kind: "compiler_moved"; compilerVersion: string; expectedLength: number; actualLength: number };

export interface BuildInput {
  promptId: string;
  version: VersionRow;
  /** The pinned model the checks were proved against (`CLAUDE.md` rule 9's target model). */
  model: string;
  params: ArtifactParams;
  variables: readonly ArtifactVariable[];
  /** The `suite_runs` row that proved it, or null when the prompt asserts nothing. */
  checkSuiteId: string | null;
}

export function artifactForVersion(input: BuildInput): { artifact: Artifact } | { refusal: BuildRefusal } {
  const recompiled = compileVersion(input.version);
  if (recompiled === undefined) return { refusal: { kind: "unreadable_snapshot" } };

  if (recompiled.compiled.text !== input.version.compiledText) {
    return {
      refusal: {
        kind: "compiler_moved",
        compilerVersion: COMPILER_VERSION,
        expectedLength: input.version.compiledText.length,
        actualLength: recompiled.compiled.text.length,
      },
    };
  }

  return {
    artifact: artifactOf({
      promptId: input.promptId,
      compiled: recompiled.compiled,
      bloks: recompiled.promptBloks,
      model: input.model,
      params: input.params,
      variables: input.variables,
      checkSuiteId: input.checkSuiteId,
    }),
  };
}
