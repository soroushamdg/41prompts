/* Bloks: typed parts of a prompt (docs/FEATURES.md M03). Expects bloks never
   reach the compiled prompt. Shared by client and server. */

export const BLOK_TYPES = ["context", "constraint", "example", "expects"] as const;
export type BlokType = (typeof BLOK_TYPES)[number];

export type Blok = { id: string; type: BlokType; text: string };

export const BLOK_LABEL: Record<BlokType, string> = {
  context: "Context",
  constraint: "Constraint",
  example: "Example",
  expects: "Expects",
};

export const BLOK_HINT: Record<BlokType, string> = {
  context: "Who the model is and the world it works in.",
  constraint: "A rule on length, tone or format.",
  example: "A sample input and the reply you want back.",
  expects: "What a good answer always does. Becomes a test, not prompt text.",
};

export const BLOK_ID = /^B[1-9][0-9]{0,5}$/;

/** Limits: about 100 KB of text per prompt (M02), and a generous blok cap. */
export const MAX_PROMPT_CHARS = 100_000;
export const MAX_BLOKS = 400;
