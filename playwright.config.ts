import { defineConfig } from "@playwright/test";

/**
 * The port the suite drives. 3000 unless `E2E_PORT` says otherwise.
 *
 * Configurable because `reuseExistingServer` is a trap when it is not: anything already listening
 * on 3000 — another project's dev server, a stray Docker container — is silently accepted as our
 * app, and every assertion then fails against somebody else's HTML with no hint as to why. CI is
 * unaffected (it starts clean and `reuseExistingServer` is false there).
 */
const port = Number(process.env.E2E_PORT ?? 3000);

/**
 * Screenshot generators are excluded from the ordinary run.
 *
 * `apps/web/e2e/capture/` holds specs whose whole job is writing PNGs into `docs/`, and two ordinary
 * specs (`auth`, `landing`) end with one such write guarded on this same flag. Left in the default
 * suite they rewrite committed files on every `pnpm e2e`, which makes `git status` useless as a
 * signal — and that is how a stray NUL byte survived two self-reviews (`docs/PROCESS.md`).
 *
 * `pnpm e2e` runs everything except `capture/` and writes nothing into the tree.
 * `pnpm e2e:capture` sets `E2E_CAPTURE=1` and runs **everything**, generators included — the two
 * guarded writes live inside real tests, so regenerating them means running those tests.
 */
const capturing = process.env.E2E_CAPTURE === "1";

export default defineConfig({
  testDir: "./apps/web/e2e",
  testIgnore: capturing ? [] : ["**/capture/**"],
  // Serial, single worker: the magic-link rate limit (lib/auth.ts) is keyed per IP in an
  // in-memory store shared by every request the dev server handles. Parallel workers hitting
  // the same server would share that budget and make the suite flaky depending on run order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://localhost:${port}`,
  },
  webServer: {
    command: `pnpm --filter @41prompts/web dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      /**
       * **Pinned to the port the suite actually drives.**
       *
       * Better Auth checks a request's origin against `baseURL` and refuses the mismatch, so with
       * `.env` saying `:3000` and `E2E_PORT=3100` every sign-in silently failed: the magic-link
       * verify redirected fine, no session cookie was set, and three auth tests failed in a way that
       * looked environmental. They were reported as "pre-existing failures" across three epics
       * (EPIC-014 through EPIC-016) and they were nothing of the kind — they were this line missing.
       *
       * Deriving it from `port` rather than trusting `.env` means changing `E2E_PORT` cannot
       * reintroduce it.
       */
      BETTER_AUTH_URL: `http://localhost:${port}`,
    },
  },
});
