/**
 * The shapes the share and waitlist actions return.
 *
 * Here rather than beside the actions because a `"use server"` module may export **only async
 * functions** — Next 16 rejects a constant or a type in one at request time, with a 500 on the route
 * rather than a type error. EPIC-013 found that the expensive way.
 */

export type ShareState =
  | { readonly status: "idle" }
  | { readonly status: "shared"; readonly id: string }
  | { readonly status: "error"; readonly message: string };

export const SHARE_INITIAL: ShareState = { status: "idle" };

export type WaitlistState =
  | { readonly status: "idle" }
  | { readonly status: "joined" }
  | { readonly status: "error"; readonly message: string };

export const WAITLIST_INITIAL: WaitlistState = { status: "idle" };

/**
 * The retention sentence, in one place because it is a promise.
 *
 * **Written to stand alone.** EPIC-017 (the legal minimum) is a dependency of this epic on paper and
 * has not been built, so there is no privacy policy to link to. Rather than block, this says the
 * whole thing in plain words: how long it lasts, that anyone with the link can delete it, and that
 * there is no account involved. When EPIC-017 lands it can add a link; it must not need to add a
 * *fact*, because the sentence has to have been true on the day it shipped.
 */
export const RETENTION_SENTENCE =
  "A shared link works for 30 days, then it is deleted for good. Anyone with the link can delete it sooner — including you, from the page itself. No account, and we do not store who you are.";
