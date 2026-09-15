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
