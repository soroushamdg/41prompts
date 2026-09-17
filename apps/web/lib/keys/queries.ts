import { apiKeysForProject, type ApiKeyRow, type Db } from "@41prompts/db";
import { listProjects } from "@/lib/canvas/queries";

/**
 * Reads for Settings → API keys (EPIC-055).
 *
 * ## Why the page is account-level and the keys are not
 *
 * A key belongs to a **project** — `api_keys.project` is a foreign key and `apiKeyForPlaintext`
 * resolves through it — while Settings is account chrome, the way Providers is. So this page lists
 * every project the person owns with its keys beneath, and **names the project on every key**.
 *
 * That is the point rather than a layout accident: a key resolves prompts in exactly one project,
 * and a flat list of secrets that did not say which would be a list of interchangeable-looking
 * strings that are not interchangeable. The mockup solves the same problem by having one project in
 * view at a time; this solves it by saying so.
 *
 * Nothing here can read key material. `API_KEY_COLUMNS` does not select `hashed_key`, and the
 * plaintext exists only in the return value of `createApiKey`, once.
 */

export interface KeyedProject {
  id: string;
  name: string;
  keys: {
    /** Still usable. */
    live: ApiKeyRow[];
    /**
     * Revoked, newest first.
     *
     * **Shown rather than hidden** (ruling 6). A key you revoked is a thing you may need to look at
     * — the whole reason rotation writes two rows is so that "which key was in the field on Tuesday"
     * has an answer, and hiding the answer would spend the cost of keeping it for nothing.
     */
    revoked: ApiKeyRow[];
  };
}

export async function keyedProjectsFor(db: Db, owner: string): Promise<KeyedProject[]> {
  const projects = await listProjects(db, owner);

  // One query per project. A person has a handful of projects; a join would be cheaper in principle
  // and would need its own grouping pass, which is more code for a list this size.
  return Promise.all(
    projects.map(async (project) => {
      const rows = await apiKeysForProject(db, project.id);
      return {
        id: project.id,
        name: project.name,
        keys: {
          live: rows.filter((row) => row.revokedAt === null),
          revoked: rows
            .filter((row) => row.revokedAt !== null)
            .sort((a, b) => (b.revokedAt?.getTime() ?? 0) - (a.revokedAt?.getTime() ?? 0)),
        },
      };
    }),
  );
}

/** Whether this project is this person's. Every write in `actions.ts` goes through it first. */
export async function ownsProject(db: Db, projectId: string, owner: string): Promise<boolean> {
  const projects = await listProjects(db, owner);
  return projects.some((project) => project.id === projectId);
}
