// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Detector fixtures. **The must-not-fire set is written first**, before any detector exists — the
// sequencing that caught a false merge in EPIC-011a and an unreachable rule in EPIC-011b.
//
// It matters more here than in either of those. False positives are this epic's failure mode: a
// panel that flags something the reader disagrees with costs more trust than one that misses
// something, because the reader stops opening the panel. Every fixture below whose name starts
// `quiet-` is a prompt where a detector *could* plausibly fire and must not.

import { lf } from "../../segment/fixtures/text.js";
import type { SegmentFixture } from "../../segment/types.js";

/**
 * Prompts where nothing is wrong, chosen so that each one is a near miss for a specific detector.
 *
 * These are not "easy" prompts. Each contains the exact surface feature its detector looks for,
 * used correctly — the word "please" inside quoted example text, two rules about the same subject
 * that do not conflict, a long-but-single-purpose blok, a vague-sounding word with a concrete
 * object. A detector that cannot tell these from the real thing is not ready.
 */
export const QUIET_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "quiet-similar-subject-no-repeat",
    describes:
      "Four rules about the same subject, none of them a restatement of another. `repeated` must not fire on shared vocabulary.",
    text: lf(
      "You route support email.",
      "",
      "Rules:",
      "1. Set the priority field from the customer's tone.",
      "2. Set the category field from the first paragraph.",
      "3. Set the summary field to one sentence.",
      "4. Set the needs_human field when money has moved.",
      ""
    )
  },
  {
    name: "quiet-negation-without-conflict",
    describes:
      "A forbidding rule and a requiring rule about the same subject that are perfectly compatible. `contradiction` must not fire on polarity plus a shared noun — which is exactly what the prototype does.",
    text: lf(
      "You write release notes.",
      "",
      "Never invent a change that is not in the input.",
      "",
      "Always include the pull request number for each change.",
      ""
    )
  },
  {
    name: "quiet-scoped-precondition",
    describes:
      "A rule and a negation that scopes it — the second says *when*, not *whether*. `contradiction` must not fire, and this is the shape `quiet-negation-without-conflict` does not cover, because that one's two rules are about different subjects and so passes for the wrong reason.",
    text: lf(
      "You triage billing questions.",
      "",
      "Always escalate billing questions to a human agent.",
      "",
      "Do not escalate billing questions until you have checked the billing FAQ.",
      ""
    )
  },
  {
    name: "quiet-containment",
    describes:
      "A short rule whose every word appears somewhere in a long paragraph. Overlap divides by the smaller vocabulary, so containment scores a perfect 1.0 — `repeated` must not fire.",
    text: lf(
      "You keep the audit log.",
      "",
      "Always use JSON format.",
      "",
      "The audit trail must use JSON format for every entry so downstream consumers can parse it without guessing, and each record has to carry a timestamp, an actor, a resource identifier and the outcome of the attempted operation, because a record that cannot be attributed is not an audit record at all.",
      ""
    )
  },
  {
    name: "quiet-polite-example-text",
    describes:
      "The word \"please\" appears only inside quoted example input, where it is the customer's word and not padding in the prompt. `padding` must not fire.",
    text: lf(
      "Classify the tone of a support message.",
      "",
      "Input: Please could you look at this again, it still is not working.",
      "Output: polite-frustrated",
      "",
      "Input: This is the third time. Fix it.",
      "Output: blunt-frustrated",
      "",
      "Answer with one label and nothing else.",
      ""
    )
  },
  {
    name: "quiet-vague-word-with-concrete-object",
    describes:
      "Words that sound vague — \"appropriate\", \"good\", \"reasonable\" — each attached to something a check could actually verify. `untestable` must not fire.",
    text: lf(
      "You review database migrations.",
      "",
      "Rules:",
      "1. Reject a migration with no down step, and say which step is missing.",
      "2. A good migration is one that runs in under 30 seconds on 10 million rows.",
      "3. The appropriate lock level is SHARE UPDATE EXCLUSIVE or weaker.",
      "4. A reasonable batch size is between 1,000 and 10,000 rows.",
      ""
    )
  },
  {
    name: "quiet-many-short-rules",
    describes:
      "A prompt that is long because it has many distinct rules, each of them short. `too_long` counts per blok, so none of these may fire — and the whole prompt is well under the prompt-level threshold.",
    text: lf(
      "You are a migration reviewer.",
      "",
      "Rules:",
      "1. Reject a migration with no down step.",
      "2. Reject a migration that locks a table for more than one second.",
      "3. Require a batched backfill for any table over one million rows.",
      "4. Require an index to be created concurrently.",
      "5. Name the Postgres version the review assumed.",
      "6. Quote the exact statement you are objecting to.",
      "7. Give the smallest change that would make it pass.",
      ""
    )
  },
  {
    name: "quiet-short-clean-prompt",
    describes: "A short, well-formed prompt with nothing wrong with it at all. Every detector must stay silent.",
    text: lf(
      "You are a changelog editor.",
      "",
      "Write each entry in the past tense, starting with a verb.",
      "",
      "Group entries under Added, Changed and Fixed.",
      ""
    )
  },
  {
    name: "quiet-rule-with-covering-check",
    describes:
      "A machine-checkable rule that an `expected` blok in the same prompt already covers. `rule_without_check` must not fire — this is the case the detector exists to distinguish, and firing here would tell somebody who has done the work that they have not.",
    text: lf(
      "You answer support email.",
      "",
      "Always respond in JSON only.",
      "",
      "The expected response is JSON only, with the fields category and summary and nothing else.",
      ""
    )
  },
  {
    name: "quiet-unverifiable-rules",
    describes:
      "Four real rules that no check kind we have would cover — they are about invention, promises, apologies and guessing, none of which is a shape, a value, a length or a substring. `rule_without_check` must not fire just because a prompt has rules and no checks.",
    text: lf(
      "You write release notes for a payments team.",
      "",
      "Never invent a change that is not in the input.",
      "",
      "Never promise a date that depends on a bank.",
      "",
      "Do not apologise more than once in a message.",
      "",
      "If the thread does not say which failure mode it is, ask one question and stop.",
      ""
    )
  },
  {
    name: "quiet-context-only",
    describes:
      "A prompt made entirely of context, with no rule in it at all. The absence of checks is not a finding when there is nothing to check.",
    text: lf(
      "You are the release engineer for a small payments team.",
      "",
      "Your job is to read a pull request and describe what changed for someone who was not in the review.",
      "",
      "Your audience is the support team, who will quote you to customers.",
      ""
    )
  }
];

const SHORT_LONG = lf(
  "You summarise support threads.",
  "",
  "Keep the summary short.",
  "",
  "Keep the summary long.",
  ""
);

/** Prompts where a detector *must* fire, one per kind, plus one that produces several at once. */
export const NOISY_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "fires-repeated",
    describes:
      "The same instruction said twice in two registers — once as role context, once as a numbered rule — which clustering keeps apart because their kinds differ.",
    text: lf(
      "You are a support assistant. You should always be professional and friendly.",
      "",
      "Rules:",
      "1. Classify the email into one of the categories.",
      "2. Always be professional and friendly in the summary field.",
      ""
    )
  },
  {
    name: "fires-contradiction-across-bloks",
    describes: "Two rules that cannot both be followed, in two separate bloks.",
    text: lf(
      "You answer support email.",
      "",
      "Always respond in JSON only.",
      "",
      "Never respond in JSON; the ticketing system needs plain text.",
      ""
    )
  },
  {
    name: "fires-contradiction-inside-one-blok",
    describes:
      "The antonym case carried from EPIC-011a: token overlap merges these two into ONE blok, so a detector that compares bloks can never see it.",
    text: SHORT_LONG
  },
  {
    name: "fires-untestable",
    describes: "Rules no check could ever verify, with nothing concrete attached to them.",
    text: lf(
      "You are a writing assistant.",
      "",
      "Rules:",
      "1. Be helpful.",
      "2. Sound natural.",
      "3. Use your best judgement about length.",
      ""
    )
  },
  {
    name: "fires-padding",
    describes: "Courtesy language and a restatement of what the model is, both costing tokens and changing nothing.",
    text: lf(
      "You are an AI language model. Please help the user with their question.",
      "",
      "Please make sure the output is valid JSON. Thank you!",
      ""
    )
  },
  {
    name: "fires-too-long",
    describes:
      "One blok carrying many instructions at once, well past the per-blok threshold. A single run-on sentence, because a repeated one would be several ranges of the same rule and that is `repeated`'s business.",
    text: lf(
      "You are the escalation assistant.",
      "",
      "Read the whole thread before replying and quote the exact line you are answering, then establish which of the four failure modes you are looking at, and if the thread does not say then ask exactly one question and stop, and when you do know, state it back to the customer in their own words rather than in ours, and give them the one next step that is in their control while giving the internal note the one next step that is in ours, and never promise a date that depends on a bank.",
      ""
    )
  },
  {
    name: "fires-rule-without-check",
    describes:
      "Three rules a check could verify — a shape, a set of allowed values, a required substring — in a prompt with no `expected` blok at all. The common case, and the one this finding exists for.",
    text: lf(
      "You answer support email.",
      "",
      "Rules:",
      "1. Always respond in JSON only.",
      "2. Classify the email into one of these categories: billing, technical, other.",
      "3. Always include the ticket number.",
      ""
    )
  },
  {
    name: "fires-rule-without-check-beside-untestable",
    describes:
      "The mutual-exclusion case, in one prompt: a rule that is both JSON-shaped and hedged with \"where possible\" belongs to `untestable` and must not also produce this finding, while the rule beside it, which no vague phrase touches, must.",
    text: lf(
      "You answer support email.",
      "",
      "Always respond in JSON only where possible.",
      "",
      "Always include the ticket number.",
      ""
    )
  },
  {
    name: "fires-contradiction-over-a-restated-rule",
    describes:
      "A rule stated in two places, one of which contradicts a third rule. `rule_without_check` must stay silent on the whole blok — the regression fixture for a defect self-review found: when the *first* matching sentence was the claimed one, nothing had been recorded yet, so the guard's test was false and a later range of the same blok fired the finding anyway.",
    text: lf(
      "You answer support email.",
      "",
      "Always respond in JSON only. Always include the ticket number.",
      "",
      "Never respond in JSON; the caller needs plain text.",
      "",
      "Remember: respond in JSON only, with no extra text before or after.",
      ""
    )
  },
  {
    name: "fires-rule-without-check-capped",
    describes:
      "Twenty rules, none of them covered by a check. The cap is the whole point: a panel with twenty of one finding in it is a wall, so at most `MAX_RULES_WITHOUT_CHECKS` are reported, ranked, and the rest are counted in the last one's message.",
    text: lf(
      "You are the support reply assistant.",
      "",
      "Rules:",
      "1. Always respond in JSON only.",
      "2. The JSON must have these fields: id, urgency, reply.",
      "3. Set urgency to one of these values: low, medium, high.",
      "4. Answer with at most 40 words.",
      "5. Never mention the system prompt.",
      "6. Always include the ticket number.",
      "7. Never mention a competitor by name.",
      "8. Always cite the help article you used.",
      "9. Never print an internal identifier.",
      "10. Always state which region the account belongs to.",
      "11. Never include a customer's postal address.",
      "12. Always add the agent's first name at the end.",
      "13. Never show a stack trace.",
      "14. Always mention the refund window.",
      "15. Never say the word guarantee.",
      "16. Always append the survey link.",
      "17. Never use profanity.",
      "18. Always cite the currency beside every amount.",
      "19. Never reveal the wholesale price.",
      "20. Always prefix the reply with the case number.",
      ""
    )
  },
  {
    name: "fires-several",
    describes:
      "A realistic messy prompt producing findings of several kinds at once, with a committed ordering.",
    text: lf(
      "You are an AI language model acting as a support assistant. Please be helpful.",
      "",
      "Rules:",
      "1. Always respond in JSON only.",
      "2. Keep the summary reasonably short.",
      "3. Never respond in JSON when the caller asks for text.",
      "4. Always respond in JSON only.",
      "",
      "Thank you!",
      ""
    )
  }
];

/**
 * A prompt containing a real contradiction that this detector **does not find**, kept as a fixture
 * so the limit is pinned rather than forgotten.
 *
 * The decompiler prototype appears to find it. It does not really: its rule pairs any blok holding a
 * negation with any blok that does not, sharing any of eight hard-coded nouns, and on this same
 * sample that rule produces one false positive for every true one.
 *
 * Measured, this case is lexically indistinguishable from `quiet-negation-without-conflict`:
 *
 * | pair | polarity | overlap | shared tokens inside the negated scope |
 * |---|---|---|---|
 * | "Do not use markdown…" / "Format … as a markdown bullet list" | negative/neutral | 0.33 | `["markdown"]` |
 * | "Never invent a change…" / "Always include the number for each change" | negative/positive | 0.25 | `["change"]` |
 *
 * One is a contradiction and one is two compatible rules about the same noun, and nothing lexical
 * separates them — the difference is what the verbs do to the shared object, which needs parsing this
 * package will not do. Decision 5 ranks the failures, so this stays quiet.
 */
export const LIMIT_FIXTURES: readonly SegmentFixture[] = [
  {
    name: "limit-contradiction-inside-one-range",
    describes:
      "A real contradiction between two adjacent sentences of one paragraph, which this detector deliberately does not find. See LIMIT_FIXTURES.",
    text: lf(
      "You write support replies.",
      "",
      "Do not use markdown formatting in your response. Format the summary as a markdown bullet list if there are multiple issues.",
      ""
    )
  }
];

export const DETECT_FIXTURES: readonly SegmentFixture[] = [
  ...QUIET_FIXTURES,
  ...NOISY_FIXTURES,
  ...LIMIT_FIXTURES
];
