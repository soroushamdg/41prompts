/**
 * What an upload may be.
 *
 * **The run budget is the guard on spend; this is the guard on a paste.** A CSV is a file a person
 * chooses, and a run costs money per input — but the budget cannot help with a 200 MB file, because
 * the cost of refusing that is paid before any model is called. So both numbers are here, both are
 * refused in words, and both are in the epic report.
 *
 * `MAX_INPUTS` is the one a person is most likely to meet, and it is deliberately small for a first
 * version: a hundred inputs at a real model's prices is already more than the free plan's monthly
 * cap, so a larger number here would only move the refusal to a place where it costs something.
 */
export const MAX_INPUTS = 100;

/** 512 KB. Comfortably under Next's own server-action body limit, so the refusal is ours and says why. */
export const MAX_UPLOAD_BYTES = 512 * 1024;

export function describeUploadLimits(): string {
  return `Up to ${MAX_INPUTS} inputs, and up to ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB.`;
}

/**
 * The same two numbers, as the shape `packages/core`'s `byHandProblems` measures against (EPIC-032a).
 *
 * **One source, two paths.** The typed grid and the uploaded file are guarded by the same limits
 * because they produce the same row in the same table and cost the same to run — a set that is
 * refused as a file and accepted as a paste would be a limit with a way around it.
 *
 * `maxCharacters` is `MAX_UPLOAD_BYTES` read as UTF-16 code units rather than bytes. The two units
 * differ for non-ASCII text and they differ in the safe direction: a value of multi-byte characters
 * counts fewer units than bytes, so the typed path refuses at or before the size the file path
 * would. `by-hand.ts` says the same thing from the other side.
 */
export const GRID_LIMITS = { maxInputs: MAX_INPUTS, maxCharacters: MAX_UPLOAD_BYTES } as const;

export function describeGridLimits(): string {
  return `Up to ${MAX_INPUTS} inputs.`;
}
