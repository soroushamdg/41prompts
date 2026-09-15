import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Start `apps/worker` for the length of one spec file, and wait for it to be ready.
 *
 * ## Why the suite starts a worker at all
 *
 * A run is executed by the worker — `CLAUDE.md`'s stack says so and EPIC-032's scope builds the
 * queue there. Without one, a triggered run sits `queued` for ever, which is precisely the "spinner
 * that never ends" this epic's acceptance criteria name as unacceptable. So the e2e stack is web
 * **and** worker, which is also what production is.
 *
 * ## Why it is started per spec rather than once for the suite
 *
 * Two of this epic's criteria cannot both be true of one process: *a run with no provider is
 * refused in words*, and *a run with a provider produces results by check*. One worker has one
 * environment. Two specs, two workers, two environments — and `workers: 1` plus
 * `fullyParallel: false` mean they never overlap.
 *
 * ## It waits on a condition, not a duration
 *
 * `worker queues ready` is logged after every queue is registered. Sleeping "long enough" instead
 * would be the `waitForTimeout(350)` mistake: it asserts that a duration is enough on every machine
 * for ever, and it passes when the thing never happens at all (`PROCESS.md`).
 */
/**
 * The workspace root, found by walking up for `pnpm-workspace.yaml`.
 *
 * Not `import.meta.url`: Playwright transpiles a spec's imports to CommonJS, where `import.meta` is
 * a syntax error — which is a load-time failure of the whole file, not of one test. Not a path
 * relative to `process.cwd()` either, because that is wherever the run was started from.
 */
const REPO_ROOT = (() => {
  let directory = process.cwd();
  while (!existsSync(join(directory, "pnpm-workspace.yaml"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error("could not find the workspace root from " + process.cwd());
    directory = parent;
  }
  return directory;
})();

const READY_LINE = "worker queues ready";
const READY_TIMEOUT_MS = 60_000;

export interface RunningWorker {
  stop(): Promise<void>;
}

/**
 * Every group this module has started and not yet reaped, so an aborted run does not leak one.
 *
 * `stop()` removes its own entry; the `exit` handler below is for the runs that never reach it —
 * a spec killed by its own timeout, a `beforeAll` that threw, a Ctrl-C.
 */
const running = new Set<number>();

function killGroup(pid: number): void {
  try {
    // The negative pid is the whole process group — see the note in `startWorker`.
    process.kill(-pid, "SIGKILL");
  } catch {
    // ESRCH: it is already gone, which is the outcome we wanted.
  }
}

process.on("exit", () => {
  for (const pid of running) killGroup(pid);
});

export async function startWorker(env: Record<string, string>): Promise<RunningWorker> {
  const child: ChildProcess = spawn("pnpm", ["--filter", "@41prompts/worker", "start"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      // The worker is a long-lived process elsewhere; here it lives for one file. Sentry and the
      // summariser's budget warnings are noise in a test log and are left unset deliberately.
      NODE_ENV: "test",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
    /**
     * **Its own process group, because the thing spawned is not the thing that does the work.**
     *
     * `spawn("pnpm", …)` starts pnpm, and pnpm starts `node --import tsx/esm src/index.ts`.
     * `child.kill()` signals pnpm; the node grandchild keeps running, keeps its pg-boss connection,
     * and **keeps claiming jobs from the same queue**. Seven of them accumulated during EPIC-032
     * before anyone looked, and the symptom was not a stray process — it was a results spec whose
     * run came back `provider_not_configured`, because a worker left over from the *refusal* spec
     * had claimed the job first. Two workers with different environments on one queue is a race
     * whose loser is whichever assertion happens to be running.
     *
     * `detached` makes the child a group leader so the whole group can be signalled at once.
     */
    detached: true,
  });

  if (child.pid !== undefined) running.add(child.pid);

  const output: string[] = [];
  const collect = (chunk: Buffer): void => {
    output.push(chunk.toString());
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  await new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => {
      // The whole log, because a worker that did not start has already said why and swallowing it
      // would turn a one-line cause into an unexplained timeout.
      reject(new Error(`worker did not report "${READY_LINE}" in ${READY_TIMEOUT_MS}ms:\n${output.join("")}`));
    }, READY_TIMEOUT_MS);

    const check = (): void => {
      if (!output.join("").includes(READY_LINE)) return;
      clearTimeout(deadline);
      clearInterval(poll);
      resolve();
    };
    const poll = setInterval(check, 100);

    child.once("exit", (code) => {
      clearTimeout(deadline);
      clearInterval(poll);
      reject(new Error(`worker exited with ${code} before it was ready:\n${output.join("")}`));
    });
  });

  return {
    async stop() {
      const pid = child.pid;
      if (pid !== undefined) running.delete(pid);
      if (child.exitCode !== null) return;
      // pg-boss survives an ungraceful exit by design — an in-flight job is picked up by the next
      // worker to start — so there is nothing to drain here.
      if (pid !== undefined) killGroup(pid);
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    },
  };
}
