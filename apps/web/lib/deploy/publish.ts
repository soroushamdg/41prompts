import {
  ARTIFACT_SCHEMA_VERSION,
  artifactBytes,
  buildHashOf,
  liveMarkerOf,
  type Artifact,
  type ArtifactParams,
  type GateReport,
} from "@41prompts/core";
import {
  PUBLISH_REASON_MIN,
  RUN_PARAMS,
  liveFor,
  newestVersion,
  pinVersion,
  previousLiveFor,
  promptForOwner,
  recordPublishEvent,
  variablesForPrompt,
  versionById,
  type Db,
  type PublishEventRow,
  type VersionRow,
} from "@41prompts/db";
import { asDeclarations } from "@/lib/variables/queries";
import { compileVersion } from "@/lib/versions/compile";
import { artifactForVersion, type BuildRefusal } from "./build";
import { checksStateFor, gateFor } from "./gate";
import { mayPublish } from "./settings";
import {
  ARTIFACT_CACHE_CONTROL,
  ARTIFACT_CONTENT_TYPE,
  MARKER_CACHE_CONTROL,
  buildKey,
  markerKey,
  storeFor,
  type ArtifactStore,
} from "./store";

/**
 * Publish, "Publish anyway", and Undo (EPIC-051).
 *
 * ## The order of the two writes, and why it is that way round
 *
 * The bytes go to the store **first** and the `publish_events` row **second**.
 *
 * An artifact sitting in the store that no event names is inert: nothing resolves it, nothing serves
 * it, and the next publish of the same content writes the identical key. An event naming bytes that
 * are not in the store is a **broken Live** — every app in the field asks for an artifact that 404s.
 * So the failure that costs nothing goes first.
 *
 * ## A refusal writes nothing
 *
 * Every check happens before the first write. A refused publish leaves no object and no row, which
 * is criterion C5: a refusal that leaves a partial write is a refusal that lied.
 */

/** Why a publish did not happen. Codes; the route writes the sentences. */
export type PublishRefusal =
  | { kind: "no_such_prompt" }
  | { kind: "no_such_version" }
  | { kind: "not_permitted" }
  | { kind: "reason_too_short"; minimum: number }
  | { kind: "blocked"; report: GateReport }
  | { kind: "nothing_to_undo" }
  | { kind: "build_missing" }
  | { kind: "build"; refusal: BuildRefusal };

export interface PublishSuccess {
  event: PublishEventRow;
  artifact: Artifact;
  report: GateReport;
  /** Where a reader fetches the marker. What `GET /v1/marker/:promptId` redirects to. */
  markerUrl: string;
  artifactUrl: string;
}

export type PublishOutcome = { ok: true; value: PublishSuccess } | { ok: false; refusal: PublishRefusal };

const refuse = (refusal: PublishRefusal): PublishOutcome => ({ ok: false, refusal });

export interface PublishRequest {
  db: Db;
  promptId: string;
  owner: string;
  /** Which version to publish. Omitted means the newest — what the Deploy page calls Draft vN. */
  versionId?: string;
  /** The model the checks must have been proved against. */
  targetModel: string;
  /** Present only for "Publish anyway". `CLAUDE.md` rule 9: typed, attributed, audited. */
  anywayReason?: string;
}

export async function publishVersion(request: PublishRequest): Promise<PublishOutcome> {
  const { db, promptId, owner } = request;

  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return refuse({ kind: "no_such_prompt" });
  if (!(await mayPublish(db, prompt.project, owner))) return refuse({ kind: "not_permitted" });

  const version =
    request.versionId === undefined
      ? await newestVersion(db, promptId)
      : await versionById(db, promptId, request.versionId);
  if (version === undefined) return refuse({ kind: "no_such_version" });

  // Trimmed before it is measured, so ten spaces is not a reason. Whitespace-only collapses to "".
  const anyway = request.anywayReason === undefined ? undefined : request.anywayReason.trim();
  if (anyway !== undefined && anyway.length < PUBLISH_REASON_MIN) {
    return refuse({ kind: "reason_too_short", minimum: PUBLISH_REASON_MIN });
  }

  // 1. What does this version compile to, and how many checks does it have? The count decides
  //    whether a run is needed at all, and the run's id goes *inside* the artifact's hash, so this
  //    has to be settled before the artifact can be assembled (ADR-005 §7).
  const recompiled = compileVersion(version);
  if (recompiled === undefined) return refuse({ kind: "build", refusal: { kind: "unreadable_snapshot" } });

  const checks = await checksStateFor({
    db,
    promptId,
    version,
    checkCount: recompiled.compiled.checks.length,
    targetModel: request.targetModel,
  });

  // 2. Assemble it.
  const built = artifactForVersion({
    promptId,
    version,
    model: request.targetModel,
    params: RUN_PARAMS as ArtifactParams,
    variables: asDeclarations(await variablesForPrompt(db, promptId)),
    checkSuiteId: checks.kind === "proved" ? checks.suiteRunId : null,
  });
  if ("refusal" in built) return refuse({ kind: "build", refusal: built.refusal });

  // 3. What is Live, so the contract row has something to compare against.
  const store = await storeFor();
  const current = await liveFor(db, promptId);
  const live = current === undefined ? null : await readArtifact(store, current.buildHash);
  const liveVersion = current?.version == null ? null : ((await versionById(db, promptId, current.version)) ?? null);

  const report = await gateFor({
    db,
    promptId,
    version,
    checks,
    next: built.artifact,
    live,
    liveVersion,
    targetModel: request.targetModel,
  });

  // 4. The gate. `blocked` is a fact about the version; going past it is a decision about a person,
  //    which is why this is two branches here rather than a flag handed to the gate.
  if (report.blocked && anyway === undefined) return refuse({ kind: "blocked", report });

  // 5. **Pin it, because something is about to point at it.**
  //
  // `prompt_versions` rule 2 is that the open draft is *rewritten in place* while `pinnedAt` is
  // null, so without this the next keystroke on the canvas would silently replace the blok set that
  // an immutable `publish_events` row names — and the history would then say a version was published
  // whose snapshot is not what was published. The artifact itself is safe either way (it is in the
  // store under its own content address); what is lost is the ability to explain it.
  //
  // A run already does this, for the same reason, through `pinVersionForRun`. Only the newest row
  // can be unpinned — rule 3 mints `n + 1` the moment the newest is pinned — so pinning the newest
  // is pinning this one, and an older version is pinned already.
  //
  // **After the gate, not before.** A refused publish must not close somebody's open draft: nothing
  // points at a version that was not published.
  const pinned = version.pinnedAt === null ? ((await pinVersion(db, promptId)) ?? version) : version;

  return {
    ok: true,
    value: await commit({
      db,
      store,
      promptId,
      version: pinned,
      artifact: built.artifact,
      report,
      actor: owner,
      kind: report.blocked ? "published_anyway" : "published",
      reason: anyway ?? null,
    }),
  };
}

export interface UndoRequest {
  db: Db;
  promptId: string;
  owner: string;
  /** Required, `PUBLISH_REASON_MIN` characters. EPIC-051 ruling 3. */
  reason: string;
}

/**
 * Move Live back to the artifact it was on before.
 *
 * **It re-publishes bytes that already exist rather than rebuilding them.** The artifact being
 * restored is immutable and already in the store under its own content address, so an undo compiles
 * nothing: it writes a new marker and a new event. Rebuilding would mean re-deriving a document from
 * rows that have moved on since, and the two could differ — at which point "undo" would ship
 * something that was never Live.
 *
 * **The gate is not run.** Undo returns to a state that was already published, and a gate that could
 * refuse it would stand between an incident and its rollback. The reason is what is recorded instead.
 */
export async function undoPublish(request: UndoRequest): Promise<PublishOutcome> {
  const { db, promptId, owner } = request;

  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return refuse({ kind: "no_such_prompt" });
  if (!(await mayPublish(db, prompt.project, owner))) return refuse({ kind: "not_permitted" });

  const reason = request.reason.trim();
  if (reason.length < PUBLISH_REASON_MIN) return refuse({ kind: "reason_too_short", minimum: PUBLISH_REASON_MIN });

  const previous = await previousLiveFor(db, promptId);
  if (previous === undefined) return refuse({ kind: "nothing_to_undo" });

  const store = await storeFor();
  const artifact = await readArtifact(store, previous.buildHash);
  // The bytes are gone from the store while the log still names them. Nothing can restore that, and
  // saying so is better than writing a marker that points at a 404.
  if (artifact === null) return refuse({ kind: "build_missing" });

  const version = previous.version === null ? null : ((await versionById(db, promptId, previous.version)) ?? null);

  return {
    ok: true,
    value: await commit({
      db,
      store,
      promptId,
      version,
      versionN: previous.versionN,
      artifact,
      report: { rows: [], blocked: false },
      actor: owner,
      kind: "undone",
      reason,
    }),
  };
}

// ── The write ────────────────────────────────────────────────────────────────────────────────────

async function commit(input: {
  db: Db;
  store: ArtifactStore;
  promptId: string;
  version: VersionRow | null;
  /** For an undo, the N the restored artifact was published as — its version row may be gone. */
  versionN?: number;
  artifact: Artifact;
  report: GateReport;
  actor: string;
  kind: "published" | "published_anyway" | "undone";
  reason: string | null;
}): Promise<PublishSuccess> {
  const { store, artifact } = input;

  // Immutable, and its key is its own content hash, so a repeat is a no-op by construction.
  const objectKey = buildKey(artifact.buildHash);
  await store.put(
    {
      key: objectKey,
      // `artifactBytes` and nothing else. A second serialiser here would be the copy ADR-005 warns
      // about, whose failure mode is that verification quietly always passes.
      body: artifactBytes(artifact),
      contentType: ARTIFACT_CONTENT_TYPE,
      cacheControl: ARTIFACT_CACHE_CONTROL,
    },
    { immutable: true },
  );

  const versionN = input.versionN ?? input.version?.n ?? 1;
  const marker = liveMarkerOf({
    promptId: input.promptId,
    buildHash: artifact.buildHash,
    version: versionN,
    publishedAt: new Date(),
  });
  const markerObjectKey = markerKey(input.promptId);
  await store.put(
    {
      key: markerObjectKey,
      body: JSON.stringify(marker),
      contentType: ARTIFACT_CONTENT_TYPE,
      cacheControl: MARKER_CACHE_CONTROL,
    },
    { immutable: false },
  );

  const event = await recordPublishEvent(input.db, {
    prompt: input.promptId,
    version: input.version?.id ?? null,
    versionN,
    buildHash: artifact.buildHash,
    kind: input.kind,
    actor: input.actor,
    reason: input.reason,
    // The whole report, not a summary: an exception whose record does not say what was excepted is
    // an exception nobody can review, and none of this can be re-derived later.
    gate: input.report,
  });

  return {
    event,
    artifact,
    report: input.report,
    markerUrl: store.publicUrl(markerObjectKey),
    artifactUrl: store.publicUrl(objectKey),
  };
}

/**
 * The artifact behind a `buildHash`, verified against the hash it was stored under.
 *
 * **`buildHashOf` is the verifier and there is no second one.** ADR-005's own words: a second copy of
 * "how an artifact is serialised" fails by making verification quietly always pass. A document whose
 * re-derived hash is not its key is refused rather than used — it is either corruption or a document
 * written by something that is not this code, and neither should reach a gate.
 */
export async function readArtifact(store: ArtifactStore, buildHash: string): Promise<Artifact | null> {
  const stored = await store.get(buildKey(buildHash));
  if (stored === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored.body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;

  const artifact = parsed as Artifact;
  // A version this reader does not understand is refused rather than partially parsed — ADR-005 §3,
  // and the rule is the same on the server as it is in the SDK.
  if (artifact.schemaVersion !== ARTIFACT_SCHEMA_VERSION) return null;
  if (artifact.buildHash !== buildHash) return null;
  if (buildHashOf(artifact) !== buildHash) return null;
  return artifact;
}
