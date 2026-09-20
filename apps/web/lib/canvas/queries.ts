import {
  blokHash,
  BLOK_KINDS,
  compile,
  type BlokKind,
  type Compiled,
  type KeptSpan,
  type PromptBlok,
} from "@41prompts/core";
import {
  bloksForPrompt,
  projects,
  promptForOwner,
  prompts,
  type BlokRow,
  type Db,
} from "@41prompts/db";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { metricsForProjects, type ProjectMetrics } from "./metrics";

/**
 * Reads for the canvas routes. **Every one takes an owner**, and there is no variant that does not.
 *
 * The thin layer over `@41prompts/db`'s helpers exists to keep the route files free of Drizzle and
 * to put the "resolve, or 404" shape in one place — a route that forgets to scope is the bug this
 * epic's decision 3 is about, and it is much harder to forget when the only available call needs an
 * owner to compile.
 */

export interface CanvasBlok extends Omit<BlokRow, "kind"> {
  kind: BlokKind;
}

function isBlokKind(value: string): value is BlokKind {
  return (BLOK_KINDS as readonly string[]).includes(value);
}

/**
 * A kind read back out of the database.
 *
 * `kind` is a `text` column validated at the boundary rather than by a database constraint, so a row
 * written by an older build — or by hand — could in principle hold anything. Falling back to
 * `context` rather than throwing is deliberate: `context` is the safe default for exactly this
 * reason (`classify/types.ts` says so), and a canvas that refuses to render because one row is odd
 * is worse for the person whose writing is in it than a card labelled slightly wrongly.
 */
function asKind(value: string): BlokKind {
  return isBlokKind(value) ? value : "context";
}

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** How many prompts live in it. The mockup's sub-line counts bloks; a project holds prompts. */
  readonly prompts: number;
  readonly metrics: ProjectMetrics;
}

/**
 * The project list, with the three numbers the mockup puts on each card.
 *
 * **A fixed number of queries, whatever the project count**: this one, the prompt counts, and the
 * three `metricsForProjects` makes. Never one per project — `metrics.test.ts` asserts that twelve
 * cost what one costs, which is the property a card grid can quietly lose.
 */
export async function listProjects(db: Db, owner: string): Promise<ProjectListItem[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.owner, owner), isNull(projects.deletedAt)))
    .orderBy(asc(projects.createdAt));

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const counts = await db
    .select({ projectId: prompts.project, n: sql<number>`count(*)::int` })
    .from(prompts)
    .where(and(inArray(prompts.project, ids), isNull(prompts.deletedAt)))
    .groupBy(prompts.project);
  const promptCount = new Map(counts.map((row) => [row.projectId, row.n]));

  const metrics = await metricsForProjects(db, owner, ids);

  return rows.map((row) => ({
    ...row,
    prompts: promptCount.get(row.id) ?? 0,
    metrics: metrics.get(row.id) ?? {}
  }));
}

async function projectForOwner(db: Db, projectId: string, owner: string) {
  const [row] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.owner, owner), isNull(projects.deletedAt)))
    .limit(1);
  return row;
}

export async function listPrompts(db: Db, projectId: string, owner: string) {
  // Scoped by resolving the project first: a prompt list is only reachable through a project this
  // owner has, so an unknown or someone else's project id yields an empty list, never a leak.
  const project = await projectForOwner(db, projectId, owner);
  if (project === undefined) return undefined;
  const rows = await db
    .select({ id: prompts.id, name: prompts.name })
    .from(prompts)
    .where(and(eq(prompts.project, projectId), isNull(prompts.deletedAt)))
    .orderBy(asc(prompts.createdAt));
  return { project, prompts: rows };
}

/** The canvas: the prompt if this owner can reach it, and its bloks in rank order. */
export async function canvasForOwner(db: Db, promptId: string, owner: string) {
  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return undefined;
  const rows = await bloksForPrompt(db, promptId);
  return { prompt, bloks: rows.map((row): CanvasBlok => ({ ...row, kind: asKind(row.kind) })) };
}

/**
 * The compiled prompt for a canvas, with hand edits carried through.
 *
 * `order` comes from the row's position, not from `rank`: rows arrive in rank order already, and
 * `PromptBlok.order` only has to reproduce that sequence. Deriving a number from the fractional
 * index would be a second ordering to keep in step with the first.
 *
 * `keep` is rebuilt from the rows — which is exactly why EPIC-020's `keep` is a serialisable map and
 * not a previous `Compiled`. The hand edit lives on the blok row, so it survives a page load, a
 * reorder, and another blok being added, without the pane holding any state of its own.
 */
export function compiledForBloks(rows: readonly CanvasBlok[]): {
  compiled: Compiled;
  bloks: PromptBlok[];
  hashes: Map<string, string>;
} {
  const bloks: PromptBlok[] = rows.map((row, index) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    order: index,
  }));

  const keep = new Map<string, KeptSpan>();
  for (const row of rows) {
    if (row.editedText !== null && row.editedFromHash !== null) {
      keep.set(row.id, { text: row.editedText, hash: row.editedFromHash });
    }
  }

  // The blok's hash as it is *now* — what the pane hands back as `fromHash` when somebody takes a
  // span, so "the blok has changed since you edited this" stays answerable afterwards.
  const hashes = new Map(bloks.map((blok) => [blok.id, blokHash(blok)]));

  return { compiled: compile(bloks, { keep }), bloks, hashes };
}
