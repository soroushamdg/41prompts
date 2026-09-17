import { projects } from "./schema";
import { newProjectId } from "./ids";
import type { DbOrTx } from "./client";

/**
 * Insert a project, minting a fresh id when the one drawn is already taken (EPIC-053).
 *
 * ## The retry `ids.test.ts` said would be needed, built the day it started mattering
 *
 * `CLAUDE.md` fixes a project id at `proj_` + **4 hex** — 65,536 values — and that is a deliberate
 * trade: the id is read aloud, typed into a URL and put in a support ticket, so it is short. What it
 * is not is collision-free. `ids.test.ts` has said so since it was written:
 *
 * > *"project ids rely on the column's primary key plus a **retry-on-conflict at insert time** (not
 * > built by this epic, since nothing creates a project yet beyond the seed script), not on the
 * > generator alone."*
 *
 * Nothing created a project then. Everything creates projects now — every e2e test, every drive,
 * every sign-up — and the birthday bound is not a distant worry at this width: a few hundred rows
 * puts a collision at percent-level odds *per run*, which is exactly the shape of an intermittent
 * failure that lands on a different test every time.
 *
 * **It was found by `gates.mjs ci`, not by a test**, and it presented as flakiness: one e2e failure
 * per run, never the same one, each looking like a timeout or an unrelated assertion. The server log
 * had the real sentence in it — `duplicate key value violates unique constraint "projects_pkey"` —
 * which is `docs/PROCESS.md`'s rule about probing the thing rather than reasoning about the symptom.
 *
 * ## Why a retry rather than a wider id
 *
 * A wider id is `CLAUDE.md`'s naming rule, and that is Soroush's. It is also the wrong lever: the
 * primary key already makes a collision *impossible to store*, so the only thing missing is drawing
 * again. Four attempts takes the probability of a run of bad luck below anything worth thinking
 * about — at a thousand existing projects each draw fails with probability ~0.015, so four
 * consecutive failures is about one in twenty million — and if all four miss, the caller is told
 * rather than handed a project that does not exist.
 *
 * ## One implementation, three callers
 *
 * `apps/web` created projects in two places and `seed.ts` in a third, each with its own `insert`.
 * Putting the retry in one of them would have left the other two broken in a way nobody would find
 * until it happened in front of somebody — the argument this repository has now made for
 * `buildHashOf`, for the publish gate, and for the codegen this epic moved into core.
 */

/** Postgres's `unique_violation`. */
const UNIQUE_VIOLATION = "23505";

/**
 * How many ids to draw before giving up.
 *
 * Four, and the number is the point: it is small enough that a systematic failure — a broken
 * generator, a table with every id taken — surfaces as an error rather than as a hang, and large
 * enough that ordinary bad luck never reaches a user.
 */
export const PROJECT_ID_ATTEMPTS = 4;

export interface NewProject {
  readonly owner: string;
  readonly name: string;
  /** Built from the id, so it is a function of it rather than a value passed in. */
  readonly slugFor: (id: string) => string;
}

export class ProjectIdExhausted extends Error {
  constructor(readonly attempts: number) {
    super(`could not mint an unused project id in ${attempts} attempts`);
    this.name = "ProjectIdExhausted";
  }
}

const isUniqueViolation = (error: unknown): boolean => {
  // node-postgres puts the SQLSTATE on the error; drizzle wraps it and keeps the original as `cause`.
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some((candidate) => (candidate as { code?: string } | null | undefined)?.code === UNIQUE_VIOLATION);
};

/**
 * Insert one project and return the id it got.
 *
 * `db` is the connection or a transaction — `startFromExampleAction` creates a project and a prompt
 * in one, and the retry has to happen inside it rather than around it.
 *
 * ## `mintId` is a parameter so the retry can be proved rather than assumed
 *
 * Every caller uses the default. A test cannot otherwise force the collision this function exists
 * for: `newProjectId` draws an unused id nearly every time, so a suite that just inserted projects
 * would pass identically against the version with no retry at all — which is precisely how the
 * missing retry survived until `gates.mjs ci` found it. With the generator injectable, a test hands
 * back an id it has already taken and watches this draw again, and watches it give up when every
 * draw collides.
 *
 * It is a seam both callers share rather than one of two (`docs/PROCESS.md`'s rule about a test seam
 * in one caller not being a seam): there is one implementation and the default is the real
 * generator.
 */
export async function insertProject(
  db: DbOrTx,
  project: NewProject,
  mintId: () => string = newProjectId,
): Promise<string> {
  for (let attempt = 1; attempt <= PROJECT_ID_ATTEMPTS; attempt += 1) {
    const id = mintId();
    try {
      await db.insert(projects).values({
        id,
        owner: project.owner,
        name: project.name,
        slug: project.slugFor(id),
      });
      return id;
    } catch (error) {
      // Only a collision is retried. Anything else — a bad owner, a dead connection — is the
      // caller's to see, and swallowing it here would turn a real failure into four of them.
      if (!isUniqueViolation(error) || attempt === PROJECT_ID_ATTEMPTS) {
        if (isUniqueViolation(error)) throw new ProjectIdExhausted(PROJECT_ID_ATTEMPTS);
        throw error;
      }
    }
  }
  throw new ProjectIdExhausted(PROJECT_ID_ATTEMPTS);
}
