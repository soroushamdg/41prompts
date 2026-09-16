/**
 * What a person needs to read before they hand us a provider key (EPIC-043).
 *
 * ## One copy, two places
 *
 * `/legal/security` renders it today, so the guidance exists before the box to paste a key into
 * does. EPIC-042 renders the same three actions beside that box, where they are actually load
 * bearing. Two renderings of one source, because the version a person reads while deciding and the
 * version they read while typing must not be able to disagree.
 *
 * ## Why the guidance is about the provider and not about us
 *
 * Everything here is an action taken at Anthropic, OpenAI or Google, and that is the point rather
 * than an omission. We can encrypt a key, refuse to log it and forget it on request; we cannot cap
 * what it is allowed to spend, we cannot narrow what it is allowed to do, and revoking it here does
 * not revoke it anywhere else. Those three are the controls that matter most and every one of them
 * lives at the provider's own console. A page that implied otherwise would be selling a safety it
 * does not have.
 *
 * `docs/security/byo-key-threat-model.md` finding 6 is this, and its mitigation is this text.
 */

export interface KeyGuidanceAction {
  /** The imperative, short enough to scan. */
  readonly action: string;
  /** Why, in one sentence, and honest about what it is protecting against. */
  readonly because: string;
}

export const KEY_GUIDANCE_TITLE = "If you bring your own provider key";

export const KEY_GUIDANCE_SUMMARY =
  "Running your prompt against a model uses a key you supply, so the spending and the limits are yours and they are set at your provider, not here.";

export const KEY_GUIDANCE_ACTIONS: readonly KeyGuidanceAction[] = [
  {
    action: "Make a key for 41Prompts alone, not the one your production service already uses.",
    because: "Then taking it away costs you nothing else, and anything done with it is attributable to us.",
  },
  {
    action: "Set a spending limit on that key at your provider.",
    because:
      "We cap what one run may cost, and we refuse a run that would go over it. Only your provider can cap what the key may cost in total, across everything.",
  },
  {
    action: "Revoke it at your provider if anything looks wrong, before you tell us.",
    because:
      "Revoking there takes effect immediately and everywhere. Removing it here only stops us from using it, which is the smaller half.",
  },
];

/** How the key is held, in the terms a person can check against what we actually do. */
export const KEY_GUIDANCE_HOLDING: readonly string[] = [
  "It is encrypted before it is written down, and the key that decrypts it is not in the database. A copy of our database, or of a backup, is unreadable on its own.",
  "We show you the last four characters, which is what your provider shows you too. Nothing else is ever displayed.",
  "It is kept out of our logs, our error reports and our analytics — every value on its way to any of the three is searched for key-shaped text and redacted first.",
  "Delete it and the stored copy goes with it. So does everything else, if you delete your account.",
];
