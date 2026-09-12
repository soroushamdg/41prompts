import { BLOK_KINDS, type BlokKind } from "@41prompts/core";
import {
  bloksForPrompt,
  projects,
  promptForOwner,
  prompts,
  type BlokRow,
  type Db,
} from "@41prompts/db";
import { and, asc, eq, isNull } from "drizzle-orm";

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

export function isBlokKind(value: string): value is BlokKind {
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

export async function listProjects(db: Db, owner: string) {
  return db
    .select({ id: projects.id, name: projects.name, slug: projects.slug })
    .from(projects)
    .where(and(eq(projects.owner, owner), isNull(projects.deletedAt)))
    .orderBy(asc(projects.createdAt));
}

export async function projectForOwner(db: Db, projectId: string, owner: string) {
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
