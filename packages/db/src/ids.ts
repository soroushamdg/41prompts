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
