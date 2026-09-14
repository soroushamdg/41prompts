// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Public surface of `@41prompts/core`. The classifier, clustering, detectors, compiler, checks,
 * graders and artifact schema land in the rest of Stage 1 and Stage 2.
 */
export const CORE_VERSION = "0.0.1";

export * from "./budgets.js";

// The segmenter (EPIC-010). `segment()` and its offsets are a public contract from the moment
// the SDK exists: see `segment/types.ts` for what the offsets are counted in, and
// `segment/README.md` for the rule order.
export { segment } from "./segment/segment.js";
export { LIST_MIN_ITEMS, SENTENCE_SPLIT_THRESHOLD } from "./segment/constants.js";
export { checkSegmentInvariants } from "./segment/invariants.js";
export type { InvariantViolation } from "./segment/invariants.js";
export type { Segment } from "./segment/types.js";

// The classifier and clustering (EPIC-011a). `classify()` gives a segment a kind; `cluster()`
// turns a flat list of segments into bloks, each owning a *set* of ranges — the step that makes a
// rule stated in three places one thing the user edits once.
export { classify } from "./classify/classify.js";
export { BLOK_KINDS } from "./classify/types.js";
export type { BlokKind, Classification } from "./classify/types.js";
export { cluster, MERGE_OVERLAP_THRESHOLD } from "./cluster/cluster.js";
export { checkBlokInvariants } from "./cluster/invariants.js";
export type { Blok } from "./cluster/types.js";
export type { Range } from "./segment/types.js";

// Findings (EPIC-012a) — the visible value of the decompiler, and advisory only: nothing here
// blocks and nothing is auto-fixed. Blocking belongs to publishing (`CLAUDE.md` rule 9).
export { detect } from "./detect/detect.js";
// The panel's closing count (EPIC-013 decision 5) names every rule nothing checks, including the ones
// `MAX_RULES_WITHOUT_CHECKS` kept off the list. It is not recoverable from `detect()`'s output,
// which states the remainder in prose, so it is its own export sharing the detector's candidate set.
export { uncheckedRuleCount } from "./detect/rule-without-check.js";
export {
  MAX_BLOK_WORDS,
  MAX_PROMPT_WORDS,
  MAX_RULES_WITHOUT_CHECKS,
  REPEAT_OVERLAP_THRESHOLD
} from "./detect/constants.js";
export { FINDING_KINDS } from "./detect/types.js";
export type { Finding, FindingKind, Severity } from "./detect/types.js";

// The blok model and the compiler (EPIC-020). Two representations of one prompt: the blok set is the
// source of truth and the compiled prompt is derived from it. `compile()` is per blok and cached by
// content hash, so changing one blok changes exactly one span; `drift()` is a pure query over
// hashes, never stored state. See `compile/README.md` for why the blok set wins and for the two
// facts a span carries — they are two and not one, and the model says so.
export { compile } from "./compile/compile.js";
export { editSpan } from "./compile/edit-span.js";
export { updateFromBlok } from "./compile/update-from-blok.js";
export { drift } from "./compile/drift.js";
export { checkCompiledInvariants } from "./compile/invariants.js";
export { blokHash, BLOK_SEPARATOR, COMPILER_VERSION } from "./compile/hash.js";
export { checkKindFor } from "./compile/checks.js";

// Checks and deterministic graders (EPIC-030). An expected blok becomes a check; `grade()` executes
// one against a model's output and answers pass, fail, or "nobody can tell yet" — never a guess
// dressed as an answer. Pure, deterministic, and still zero-dependency.
export { grade, gradeAll, summarise } from "./check/grade.js";
export { GRADERS, countCharacters, countWords } from "./check/graders.js";
export { paramsFor } from "./check/params.js";
export { isPatternSafe, rejectUnsafePattern, MAX_PATTERN_LENGTH } from "./check/pattern-safety.js";
export { suggestFor } from "./check/suggest.js";
export type { CheckOutcome, CheckResult, CountingUnit, Evidence, NotGradedReason, RunSummary } from "./check/types.js";
export type { CheckParams } from "./check/params.js";
export type { Grader, GraderVerdict } from "./check/graders.js";
export type { PatternRejection } from "./check/pattern-safety.js";
export type { CheckSuggestion } from "./check/suggest.js";
export { CHECK_KINDS, CHECK_KIND_PHRASES } from "./compile/types.js";
export type {
  Check,
  CheckKind,
  Compiled,
  CompiledSpan,
  CompileOptions,
  DriftReport,
  KeptSpan,
  KeptSpans,
  PromptBlok,
  SpanCache,
  SpanDrift,
  SpanState
} from "./compile/types.js";

// Variables (EPIC-022). `{{name}}` in the text a model sees, against what the prompt declares.
// A disagreement between the two is a `VariableIssue` and **never** a seventh `Finding` — ADR-003
// says why, and the short version is that a finding is a claim about prose we did not write.
export { extractVariables, usedVariableNames, occurrencesInText, isVariableName } from "./variables/extract.js";
export { variableIssues } from "./variables/issues.js";
export { renameVariable } from "./variables/rename.js";
export { isOptional } from "./variables/types.js";
export type { VariableScanOptions } from "./variables/extract.js";
export type { RenameResult, RenameRefusal, RenamedText } from "./variables/rename.js";
export type {
  VariableDeclaration,
  VariableIssue,
  VariableIssueKind,
  VariableOccurrence,
  VariableSchema
} from "./variables/types.js";

// The build artifact (EPIC-022 ships v1; EPIC-050 freezes it). **Not a public contract yet** — the
// file says so in as many words, and `CLAUDE.md` protects it only once Stage 5a begins.
export { ARTIFACT_SCHEMA_VERSION, artifactOf } from "./artifact/schema.js";
export type { Artifact, ArtifactVariable } from "./artifact/schema.js";

// The summariser seam (EPIC-011b). A summary is metadata *about* a blok's text and never a
// replacement for it (`CLAUDE.md` rule 3): the compiler emits the verbatim source span, never this.
export { heuristicSummariser, HEURISTIC_SUMMARISER_VERSION, SUMMARY_MAX_LENGTH } from "./summarise/heuristic.js";
export { summaryInputHash } from "./summarise/hash.js";
export { checkSummaryContract, MAX_REASONABLE_SUMMARY } from "./summarise/contract.js";
export type { ContractViolation } from "./summarise/contract.js";
export type { AsyncSummariser, Summariser, Summary } from "./summarise/types.js";

// The committed 29-prompt corpus is NOT here. It is real and it is shared — EPIC-011a's
// clustering tests and EPIC-013's UI fixtures read the same prompts these snapshots were built
// from, rather than three drifting copies (epic decision 8) — but it is test data, and this
// module is the surface EPIC-052 freezes. It lives one subpath away:
//
//     import { SEGMENT_FIXTURES } from "@41prompts/core/fixtures";
