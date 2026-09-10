import type { DecompileView } from "./view-model";

/**
 * The input cap, in UTF-8 bytes — carried from EPIC-011a's open question 3.
 *
 * Bytes rather than characters because "100 KB" is a size somebody can check against the file they
 * pasted from, and because it is the number that actually bounds the work: 100 KB of Arabic or emoji
 * is half as many characters but the same amount of memory. `packages/core`'s throughput gate is
 * measured at 100 KB too, so the cap and the gate are the same number.
 */
export const MAX_INPUT_BYTES = 102_400;

/**
 * These live here rather than in `actions.ts` because a `"use server"` module may export **only
 * async functions** — Next 16 refuses to compile one that exports a constant or a type, and the
 * failure is a 500 on the route rather than a type error. Found by running the page.
 */
export type DecompileState =
  | { readonly status: "idle" }
  | { readonly status: "empty" }
  | { readonly status: "too-long"; readonly bytes: number }
  | { readonly status: "ok"; readonly source: string; readonly view: DecompileView };

export const INITIAL_STATE: DecompileState = { status: "idle" };

export function kilobytes(bytes: number): string {
  return `${Math.round((bytes / 1024) * 10) / 10} KB`;
}

/**
 * The over-length message. Product copy, read by a stranger with no context: it names the limit, and
 * it names what they actually sent, because "too long" without a number is a dead end.
 */
export function tooLongMessage(bytes: number): string {
  return `That prompt is ${kilobytes(bytes)}. The limit is ${kilobytes(MAX_INPUT_BYTES)} — paste the part you want to look at.`;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
