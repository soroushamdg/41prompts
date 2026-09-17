import type { GateReason, GateReport } from "@41prompts/core";
import type { BuildRefusal } from "./build";
import type { PublishRefusal } from "./publish";

/**
 * The sentences (EPIC-051).
 *
 * `packages/core` decides and returns **codes**; the words live here, where ADR-003's forbidden-word
 * grep runs. The same split `CHECK_KIND_PHRASES` already makes.
 *
 * Vocabulary, checked against `CLAUDE.md`: **Publish**, **Publish anyway**, **Undo**, **Live**,
 * **version**, **check**, **blok**. Not *block* the noun, not *override*, not *promote*, not
 * *pointer*, not *drifted*.
 */

const GATE_PHRASES: Record<GateReason, string> = {
  nothing_to_prove: "This prompt has no checks, so there is nothing to prove.",
  not_proved_on_target_model: "These checks have not been run on this model.",
  nothing_could_be_graded: "Nothing in the last run could be graded.",
  checks_failed: "Checks are failing on this model.",
  checks_passed: "Every check that could be graded passed on this model.",
  no_live_callers: "Nothing is Live yet, so no app is calling this prompt.",
  contract_compatible: "Inputs compatible with shipped apps.",
  contract_broken: "This would stop working for apps already in the field.",
  cost_unknown: "Cost per call is not known on both sides.",
  cost_unchanged: "Cost per call is unchanged.",
  cost_moved: "Cost per call has moved.",
  no_live_to_compare: "Nothing is Live to compare against.",
  blok_diff: "Bloks changed since Live.",
};

export function gatePhrase(reason: GateReason): string {
  return GATE_PHRASES[reason];
}

/** The gate, as the shape a route returns and EPIC-055's page renders. */
export function gateBody(report: GateReport) {
  return {
    blocked: report.blocked,
    rows: report.rows.map((row) => ({
      kind: row.kind,
      verdict: row.verdict,
      reason: row.reason,
      blocking: row.blocking,
      says: gatePhrase(row.reason),
      detail: row.detail,
    })),
  };
}

export function buildRefusalPhrase(refusal: BuildRefusal): string {
  if (refusal.kind === "unreadable_snapshot") {
    return "That version's blok set cannot be read, so nothing was published.";
  }
  return (
    `This version was compiled by an earlier compiler and ${refusal.compilerVersion} produces ` +
    "different text, so its checks were proved against something else. Run it again before publishing."
  );
}

/** What a refusal says and what status it carries. */
export function refusalBody(refusal: PublishRefusal): { status: number; body: Record<string, unknown> } {
  switch (refusal.kind) {
    // 404 rather than 403, the house rule: a 403 confirms the id exists. Deliberately identical for
    // "no such prompt" and "not yours".
    case "no_such_prompt":
      return { status: 404, body: { error: refusal.kind, says: "That prompt is not available." } };
    case "no_such_version":
      return { status: 404, body: { error: refusal.kind, says: "That version is not in this prompt's history." } };
    case "not_permitted":
      return { status: 403, body: { error: refusal.kind, says: "Only an admin may move this prompt to Live." } };
    case "reason_too_short":
      return {
        status: 400,
        body: {
          error: refusal.kind,
          minimum: refusal.minimum,
          says: `Say why, in at least ${refusal.minimum} characters.`,
        },
      };
    case "blocked":
      return {
        status: 409,
        body: {
          error: refusal.kind,
          says: "Publishing is stopped: one or more of the checks below did not pass.",
          gate: gateBody(refusal.report),
        },
      };
    case "nothing_to_undo":
      return { status: 409, body: { error: refusal.kind, says: "There is no earlier version to go back to." } };
    case "artifact_missing":
      return {
        status: 409,
        body: { error: refusal.kind, says: "The earlier build is no longer in storage, so Undo cannot reach it." },
      };
    case "build":
      return { status: 409, body: { error: refusal.kind, says: buildRefusalPhrase(refusal.refusal) } };
  }
}
