import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";
import { newPublishEventId } from "./ids";
import { publishedArtifacts, publishEvents, projects, prompts } from "./schema";

/**
 * The publish history, what is Live, and the bytes behind it (EPIC-051).
 *
 * Two things live here, and they are separate on purpose: **the record of a decision**
 * (`publish_events`) and **the bytes that decision made public** (`published_artifacts`). The first
 * is the audit log; the second is a store whose other implementation is R2 and which this package
 * knows nothing about beyond rows.
 *
 * Same rule as `versions.ts`: nothing here takes an `owner`. Every caller has already resolved the
 * prompt through `promptForOwner`, and a second gate that every caller satisfies by the same prior
 * check looks like access control while being an echo of it — which is worse than none, because it
 * is trusted.
 */

/** `published` · `published_anyway` · `undone`. Never a fourth. */
export const PUBLISH_EVENT_KINDS = ["published", "published_anyway", "undone"] as const;
export type PublishEventKind = (typeof PUBLISH_EVENT_KINDS)[number];

/**
 * How long a reason must be for "Publish anyway" and for an undo.
 *
 * The roadmap's own number for the first ("a reason ≥10 chars"); EPIC-051 ruling 3 applies the same
 * rule to the second. Ten is not a quality bar — it is the length at which "no" and "asdf" stop
 * being accepted, which is all a minimum can do.
 */
export const PUBLISH_REASON_MIN = 10;

export interface PublishEventRow {
  id: string;
  prompt: string;
  version: string | null;
  versionN: number;
  buildHash: string;
  kind: PublishEventKind;
  actor: string | null;
  reason: string | null;
  gate: unknown;
  createdAt: Date;
}

export interface NewPublishEvent {
  prompt: string;
  version: string | null;
  versionN: number;
  buildHash: string;
  kind: PublishEventKind;
  actor: string | null;
  reason: string | null;
  gate: unknown;
}

const EVENT_COLUMNS = {
  id: publishEvents.id,
  prompt: publishEvents.prompt,
  version: publishEvents.version,
  versionN: publishEvents.versionN,
  buildHash: publishEvents.buildHash,
  kind: sql<PublishEventKind>`${publishEvents.kind}`,
  actor: publishEvents.actor,
  reason: publishEvents.reason,
  gate: publishEvents.gate,
  createdAt: publishEvents.createdAt,
};

/** Append one entry. The log is append-only; nothing in this module updates or deletes a row. */
export async function recordPublishEvent(db: DbOrTx, event: NewPublishEvent): Promise<PublishEventRow> {
  const [row] = await db
    .insert(publishEvents)
    .values({ id: newPublishEventId(), ...event })
    .returning(EVENT_COLUMNS);
  if (row === undefined) throw new Error("recordPublishEvent: insert returned no row");
  return row;
}

/**
 * What is Live for this prompt: **the newest event**, whatever kind it is.
 *
 * An undo is an event, so the newest row after one names the artifact the undo restored. That is the
 * whole of ruling 2 — there is no second place this can be read from and therefore no second answer.
 * Returns undefined when the prompt has never been published, which is not an error: most prompts
 * have not been.
 */
export async function liveFor(db: Db, promptId: string): Promise<PublishEventRow | undefined> {
  const [row] = await db
    .select(EVENT_COLUMNS)
    .from(publishEvents)
    .where(eq(publishEvents.prompt, promptId))
    .orderBy(desc(publishEvents.createdAt), desc(publishEvents.id))
    .limit(1);
  return row;
}

/**
 * The artifact an undo would move back to, or undefined when there is nothing to go back to.
 *
 * **"The previous *artifact*", not "the previous row."** Two consecutive events can name the same
 * `buildHash` — an undo followed by a re-publish of the same artifact, say — and stepping back one
 * row would then "undo" to what is already Live, which does nothing while reporting success. So this
 * walks back to the newest event whose `buildHash` differs from the current one.
 */
export async function previousLiveFor(db: Db, promptId: string): Promise<PublishEventRow | undefined> {
  const recent = await db
    .select(EVENT_COLUMNS)
    .from(publishEvents)
    .where(eq(publishEvents.prompt, promptId))
    .orderBy(desc(publishEvents.createdAt), desc(publishEvents.id))
    .limit(50);

  const current = recent[0];
  if (current === undefined) return undefined;
  return recent.slice(1).find((row) => row.buildHash !== current.buildHash);
}

/** The whole history, newest first. The Deploy page's table (EPIC-055). */
export async function publishHistory(db: Db, promptId: string, limit = 50): Promise<PublishEventRow[]> {
  return db
    .select(EVENT_COLUMNS)
    .from(publishEvents)
    .where(eq(publishEvents.prompt, promptId))
    .orderBy(desc(publishEvents.createdAt), desc(publishEvents.id))
    .limit(limit);
}

/**
 * Every prompt in a project, with what is Live for each — the `GET /v1/prompts` query.
 *
 * One round trip rather than one per prompt: `distinct on` is Postgres's own answer to "the newest
 * row per group", the same shape `passRateForVersions` already uses.
 */
export async function liveForProject(
  db: Db,
  projectId: string,
): Promise<{ id: string; name: string; live: PublishEventRow | undefined }[]> {
  const rows = await db
    .select({ id: prompts.id, name: prompts.name })
    .from(prompts)
    .innerJoin(projects, eq(prompts.project, projects.id))
    .where(and(eq(prompts.project, projectId), sql`${prompts.deletedAt} is null`, sql`${projects.deletedAt} is null`))
    .orderBy(prompts.createdAt);

  if (rows.length === 0) return [];

  const newest = await db
    .selectDistinctOn([publishEvents.prompt], EVENT_COLUMNS)
    .from(publishEvents)
    .where(
      inArray(
        publishEvents.prompt,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(publishEvents.prompt, desc(publishEvents.createdAt), desc(publishEvents.id));

  const byPrompt = new Map(newest.map((row) => [row.prompt, row]));
  return rows.map((row) => ({ ...row, live: byPrompt.get(row.id) }));
}

// ── The store's rows ─────────────────────────────────────────────────────────────────────────────

export interface StoredObject {
  key: string;
  contentType: string;
  cacheControl: string;
  body: string;
}

/**
 * Thrown when a write-once key is asked to hold different bytes.
 *
 * Named rather than a plain `Error` because the caller has to be able to tell it from a connection
 * failure: one means retry, the other means an object that is already behind an immutable cache
 * header has been asked to change, and there is nothing to retry about that.
 */
export class ImmutableObjectChangedError extends Error {
  constructor(readonly key: string) {
    super(`published_artifacts: ${key} already holds different bytes and is immutable`);
    this.name = "ImmutableObjectChangedError";
  }
}

/**
 * Write an object.
 *
 * `immutable` keys (artifacts, addressed by their own content hash) are **write-once**: an identical
 * repeat is a no-op and a differing body throws. Mutable keys (markers) are overwritten, which is
 * what a marker is for.
 *
 * The branch is on the caller's declaration rather than on the key's shape, because "is this key
 * supposed to change" is a fact about the document and guessing it from a path is how a rename
 * becomes a corruption.
 */
export async function putObject(db: DbOrTx, object: StoredObject, options: { immutable: boolean }): Promise<void> {
  if (options.immutable) {
    const [existing] = await db
      .select({ body: publishedArtifacts.body })
      .from(publishedArtifacts)
      .where(eq(publishedArtifacts.key, object.key))
      .limit(1);
    if (existing !== undefined) {
      if (existing.body !== object.body) throw new ImmutableObjectChangedError(object.key);
      return;
    }
  }

  await db
    .insert(publishedArtifacts)
    .values(object)
    .onConflictDoUpdate({
      target: publishedArtifacts.key,
      set: {
        contentType: object.contentType,
        cacheControl: object.cacheControl,
        body: object.body,
        updatedAt: new Date(),
      },
    });
}

export async function getObject(db: Db, key: string): Promise<StoredObject | undefined> {
  const [row] = await db
    .select({
      key: publishedArtifacts.key,
      contentType: publishedArtifacts.contentType,
      cacheControl: publishedArtifacts.cacheControl,
      body: publishedArtifacts.body,
    })
    .from(publishedArtifacts)
    .where(eq(publishedArtifacts.key, key))
    .limit(1);
  return row;
}
