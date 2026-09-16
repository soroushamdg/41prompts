import { RUN_SUITE_QUEUE, TEST_PROVIDER_KEY_QUEUE } from "@41prompts/db";
import { PgBoss } from "pg-boss";

/**
 * Sending a run to the worker.
 *
 * ## Why the web has a pg-boss client at all
 *
 * `CLAUDE.md`'s stack says runs are the worker's, and they are: nothing here calls a model. What
 * the web does is **ask** — one row on a queue, with the id of a run it has already written. The
 * alternative was a worker polling `suite_runs` on a timer, which is a second mechanism doing what
 * a queue already does, with a latency floor nobody chose.
 *
 * ## One client, started once, doing as little as possible
 *
 * `supervise: false` and `schedule: false`: maintenance and cron belong to the worker, which is a
 * long-lived process that owns them. A web process that also supervised would be a second thing
 * expiring other people's jobs, on a server whose job is to answer requests.
 *
 * `createQueue` is idempotent and is called on first use, because send refuses a queue that does
 * not exist yet and the web may well be the first of the two processes to start.
 *
 * ## A failure to enqueue is not a silent failure
 *
 * The caller turns it into a refusal the person can read. A run row that exists with nothing on the
 * queue behind it is the worst available outcome: it is a spinner that never ends, which is exactly
 * what this epic's acceptance criteria name as unacceptable.
 */

let started: Promise<PgBoss> | undefined;

async function client(): Promise<PgBoss> {
  if (started === undefined) {
    started = (async () => {
      const databaseUrl = process.env.DATABASE_URL;
      if (databaseUrl === undefined || databaseUrl === "") throw new Error("DATABASE_URL is required");
      const boss = new PgBoss({ connectionString: databaseUrl, supervise: false, schedule: false });
      boss.on("error", () => {
        // pg-boss emits on a connection blip. Swallowing it here keeps an unhandled event from
        // taking the web process down; a send that actually fails still rejects at its call site.
      });
      await boss.start();
      await boss.createQueue(RUN_SUITE_QUEUE);
      await boss.createQueue(TEST_PROVIDER_KEY_QUEUE);
      return boss;
    })().catch((error: unknown) => {
      // Do not cache a failed start, or every later send inherits one bad moment for ever.
      started = undefined;
      throw error;
    });
  }
  return started;
}

export async function enqueueRun(suiteRunId: string): Promise<void> {
  const boss = await client();
  await boss.send(RUN_SUITE_QUEUE, { suiteRunId });
}

/**
 * Ask the worker to test a provider key that is already stored (EPIC-042).
 *
 * **The job carries an owner and a provider, never a key.** The row it names is sealed; the worker
 * opens it, because it is the process that may. A payload carrying a plaintext key would put a
 * credential in `pg-boss`'s own table, which is a copy in a place nothing in the threat model
 * accounts for.
 */
export async function enqueueKeyTest(owner: string, provider: string): Promise<void> {
  const boss = await client();
  await boss.send(TEST_PROVIDER_KEY_QUEUE, { owner, provider });
}
