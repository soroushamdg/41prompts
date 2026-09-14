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
    /**
     * **Against the built app, not the dev server.**
     *
     * This ran `next dev` until 2026-09-14, which meant the suite could never see a build-time or
     * asset-serving failure: the dev server generates every chunk on request and serves CSS from
     * memory, so a stylesheet that fails to build, a chunk that 404s, or anything that only exists
     * in a production bundle is invisible to it. 151 assertions passed green while the deployed
     * `/app` rendered as unstyled text — see `docs/incidents/2026-09-13-production-outage.md`.
     *
     * `E2E_DEV=1` puts it back on the dev server for fast local iteration. Use it while writing a
     * test; never to make a failing one pass. CI has no escape hatch on purpose.
     *
     * The cost is a build on every run, which is minutes. That is the price of the suite testing the
     * artifact that ships rather than a development convenience that resembles it.
     *
     * **Through turbo, not `pnpm --filter … build`.** `turbo.json`'s build task carries
     * `dependsOn: ["^build"]`, and `packages/core/dist` is a gitignored artifact: invoking Next
     * directly builds the app against whatever `dist` happens to be lying around. Writing it the
     * direct way here failed on the first run with `The export variableIssues was not found in
     * module packages/core/dist/index.js` — a stale September 12 build, from before EPIC-022 added
     * the variables module.
     */
    command: process.env.E2E_DEV === "1"
      ? `pnpm --filter @41prompts/web dev --port ${port}`
      : `npx turbo run build --filter=@41prompts/web && pnpm --filter @41prompts/web start --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    // A production build is minutes, not seconds; the old 120s was sized for `next dev`.
    timeout: process.env.E2E_DEV === "1" ? 120_000 : 600_000,
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
