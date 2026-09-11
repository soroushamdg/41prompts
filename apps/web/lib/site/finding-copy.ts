import { FINDING_KINDS, type FindingKind } from "@41prompts/core";

/**
 * The six findings, in plain language, for a stranger — and for a model reading `llms.txt`.
 *
 * **One source for both.** `llms.txt` and the companion article say the same six things, and two
 * hand-written lists would disagree within a month. The keys are `FINDING_KINDS`, so a seventh kind
 * fails the build here rather than leaving two documents quietly wrong.
 *
 * The wording is deliberately not the detector's own message. A finding message speaks about *your*
 * prompt, in front of the text it found ("Nothing checks this rule: …"); this speaks about the
 * category, to somebody who has not pasted anything yet.
 */
export interface FindingCopy {
  /** What a person would call it. Not the identifier. */
  readonly name: string;
  /** One sentence: what it is, and why it costs something. */
  readonly summary: string;
}

export const FINDING_COPY: Readonly<Record<FindingKind, FindingCopy>> = {
  contradiction: {
    name: "Contradictions",
    summary:
      "Two rules that cannot both hold — one says always, the other says never. The model will follow one of them and you will not know which until the output is wrong."
  },
  rule_without_check: {
    name: "Rules nothing checks",
    summary:
      "A rule stated in the prompt with nothing that would fail if the model stopped following it. This is the most common finding by a wide margin, and the reason the product exists."
  },
  untestable: {
    name: "Rules that cannot be checked",
    summary:
      "Instructions like \"keep it reasonably short\" or \"use your best judgement\", which no check can be written against, so they can never visibly fail."
  },
  repeated: {
    name: "Repetition",
    summary:
      "The same instruction in two places. Editing one leaves the other in force, which is how a prompt drifts away from what its author believes it says."
  },
  padding: {
    name: "Padding",
    summary:
      "Words that cost tokens and change nothing about the output — please, thank you, a restated role. Harmless individually, and they add up."
  },
  too_long: {
    name: "Bloks that do too much",
    summary:
      "One passage carrying several instructions at once. When something fails, the failure points at all of it rather than at the part that broke."
  }
};

/** The six, in reading order, as `(kind, copy)` pairs. */
export const FINDINGS_IN_ORDER: readonly (readonly [FindingKind, FindingCopy])[] = FINDING_KINDS.map(
  (kind) => [kind, FINDING_COPY[kind]] as const
);
