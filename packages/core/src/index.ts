// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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

// Input sets (EPIC-032). A CSV whose header names the prompt's variables, and one of its rows bound
// into the compiled prompt. The columns **are** the bindings — a row is substituted, never
// appended — and a header that disagrees with the declarations is refused at upload rather than at
// run time. Every problem is a fact with a position; the sentences are written in `apps/web`.
export { parseCsv } from "./inputs/csv.js";
export { bindVariables, serialiseRow } from "./inputs/bind.js";
export { inputSetProblems } from "./inputs/input-set.js";
export type { BindOutcome, BoundPrompt, UnboundPrompt } from "./inputs/bind.js";
export type { ColumnProblem, CsvParse, CsvProblem } from "./inputs/types.js";

// The build artifact, **frozen at v1 by EPIC-050** and a public contract from that moment:
// `docs/decisions/ADR-005-build-artifact.md` is the declaration, and `CLAUDE.md` puts
// `artifact/schema.ts` on the never-touch list now that Stage 5a has begun.
//
// Four pieces, and each is here rather than in `apps/*` or the SDK because a second implementation
// of any of them is a second answer to a question with one right answer: what bytes an artifact is,
// what its address is, whether a reader can trust the document it fetched, and whether publishing a
// new build breaks the callers the old one already has in the field.
export {
  ARTIFACT_SCHEMA_VERSION,
  MARKER_SCHEMA_VERSION,
  artifactBytes,
  artifactOf,
  buildHashOf,
  liveMarkerOf,
} from "./artifact/schema.js";
export type {
  Artifact,
  ArtifactBlok,
  ArtifactCheck,
  ArtifactInput,
  ArtifactParams,
  ArtifactSpan,
  ArtifactVariable,
  LiveMarker,
  LiveMarkerInput,
} from "./artifact/schema.js";
export { isCompatible } from "./artifact/compatibility.js";
export type { CompatibilityReport, ContractBreak, ContractBreakKind } from "./artifact/compatibility.js";
export { canonicalJson, CanonicalJsonError } from "./artifact/canonical.js";
export type { JsonValue } from "./artifact/canonical.js";
export { sha256, sha256Text, utf8Bytes } from "./artifact/sha256.js";
// The machine-readable half of ADR-005, for a reader written in another language. `validate` is a
// deliberate subset and refuses a keyword it does not implement rather than ignoring it.
export { ARTIFACT_JSON_SCHEMA, LIVE_MARKER_JSON_SCHEMA } from "./artifact/json-schema.js";
export { UnsupportedKeywordError, validate } from "./artifact/validate.js";
export type { JsonSchema, SchemaViolation } from "./artifact/validate.js";

// Generated bindings (EPIC-053). The Connect page shows `prompts.ts` so a person can copy it and
// `41p pull` writes it into their repository; EPIC-055 committed to those being the same file, and
// `CLAUDE.md` rule 11 stops the CLI importing the page's copy. So the generator is here and both are
// callers — `codegen/types.ts` carries the argument, which is the one this repository has now made
// three times about three different second copies.
export {
  CODEGEN_FILENAME,
  LICENCE_LINE,
  headerFor,
  identifierFor,
  identifiersFor,
  parameterFor,
  promptsFile,
  pythonPromptsFile,
  snakeCase,
  typescriptPromptsFile,
} from "./codegen/index.js";
export type { CodegenLanguage, CodegenPrompt, CodegenVariable } from "./codegen/index.js";

// The publish gate (EPIC-051). "May this version go Live" is the one decision in this product that
// must be correct, so `CLAUDE.md` rule 1 puts it here with its tests rather than in a route handler.
// It answers from facts and never acts: no clock, no database, no "Publish anyway" — the escape rule
// 9 sanctions belongs to the caller, which records this report as the thing it went past.
export { publishGate } from "./publish/gate.js";
export type {
  BlokDiffCounts,
  ChecksState,
  CostComparison,
  GateDetail,
  GateReason,
  GateReport,
  GateRow,
  GateRowKind,
  GateVerdict,
  PublishGateInput,
} from "./publish/types.js";

// Versions and semantic diff (EPIC-040). A version is a frozen blok set; `diff()` answers what a
// person changed between two of them. Bloks are matched by **id**, which is what lets a move be
// reported as a move rather than as a removal plus an addition — `version/diff.ts` has the argument.
export { diff } from "./version/diff.js";
export { readSnapshot, readSnapshotBloks, snapshot } from "./version/snapshot.js";
export type { HandEdit } from "./version/snapshot.js";
export type {
  BlokAppearance,
  BlokChange,
  BlokMove,
  SnapshotBlok,
  VersionDiff,
  VersionSnapshot,
} from "./version/types.js";

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
