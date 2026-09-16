import { randomBytes } from "node:crypto";

function newId(prefix: string, hexBytes: number): string {
  return `${prefix}_${randomBytes(hexBytes).toString("hex")}`;
}

export function newProjectId(): string {
  return newId("proj", 2);
}

export function newPromptId(): string {
  return newId("pr", 4);
}

/**
 * A blok row's id: `blok_` + 16 hex, **minted once and never recomputed**.
 *
 * EPIC-021a decision 1 as first written said blok ids are the content-derived ids EPIC-011a produces,
 * "stable across recompiles". They are stable across recompiles of the *same text*, which is exactly
 * what makes them right for a decompile and wrong for a row somebody edits: the id changes the moment
 * the text does, so on every keystroke the row's rank, its hand edit and its history would be orphaned
 * onto an id nothing points at. Amended 2026-09-12; EPIC-020 settled the same question for
 * `PromptBlok.id`.
 *
 * A blok imported from a decompile keeps the decompiler's `blok_`-prefixed content-derived id as its
 * first value — the two shapes are deliberately the same width — and is never recomputed after that.
 */
export function newBlokId(): string {
  return newId("blok", 8);
}

export function newApiKeyId(): string {
  return newId("key", 8);
}

export function newRunBudgetId(): string {
  return newId("bud", 4);
}

/**
 * A permalink id: `dc_` + 12 hex.
 *
 * **Unguessable, and deliberately not sequential** (EPIC-014 decision 1). A shared decompile is
 * readable by anyone holding the link, so the link *is* the access control: six random bytes is
 * 2^48 possibilities, which is not brute-forceable at any rate a rate limiter would allow, while a
 * counter would let anyone read every prompt ever pasted by adding one.
 *
 * Longer than the other ids in this file for exactly that reason — a `proj_` id is only ever handed
 * to someone who is already authenticated, and this one is not.
 */
export function newDecompileId(): string {
  return newId("dc", 6);
}

export function newWaitlistId(): string {
  return newId("wl", 6);
}

/** A counted run. Six bytes like a permalink id — it is never handed out, but it costs nothing. */
/**
 * A declared variable's row id (EPIC-022).
 *
 * The row is identified by an id rather than by `(prompt, name)` even though that pair is unique,
 * because **rename is the operation this table exists to survive**: a composite key would make a
 * rename an update to the primary key, and anything that later references a variable would be
 * referencing a value that changes. Nothing references one yet, which is the cheapest moment to
 * decide that nothing ever has to.
 */
export function newVariableId(): string {
  return newId("var", 8);
}

export function newDecompileRunId(): string {
  return newId("dr", 6);
}

/**
 * One provider call.
 *
 * Eight hex, matching `newBlokId`'s neighbourhood rather than the six the anonymous counters use:
 * a run is referenced from a result, from a budget reconciliation and from a purge audit, and an
 * id that collides is a wrong answer in three places rather than a duplicated tally in one.
 */
export function newRunId(): string {
  return newId("run", 8);
}

/**
 * One uploaded set of inputs (EPIC-032).
 *
 * Eight hex like a blok's, not six like the anonymous counters': an input set is what a run is
 * *over*, so an id that collided would attribute one person's results to another person's file.
 */
export function newInputSetId(): string {
  return newId("inp", 8);
}

/** One triggered run over one input set at one model. The id a person sees in the URL. */
export function newSuiteRunId(): string {
  return newId("srun", 8);
}

/**
 * One check, as it stood when the run was triggered.
 *
 * A row here is a frozen copy of a check — its kind, its owning blok and that blok's **verbatim**
 * text at trigger time — because re-deriving it later would grade against a blok whose text has
 * since changed and attribute a failure to a blok that no longer says that.
 */
export function newSuiteCheckId(): string {
  return newId("schk", 8);
}

/** One check, graded against one input. */
export function newSuiteResultId(): string {
  return newId("sres", 8);
}

/**
 * One frozen version of a prompt's blok set (EPIC-040).
 *
 * Eight hex, like a run's and for the same reason: a version is what EPIC-041 compares, EPIC-050
 * freezes into an artifact and EPIC-051 publishes, so a collision would publish one person's prompt
 * under another person's pointer. Six is for things nobody addresses across an account boundary.
 */
export function newPromptVersionId(): string {
  return newId("pv", 8);
}
