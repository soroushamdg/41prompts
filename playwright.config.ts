import { defineConfig } from "@playwright/test";

import { applyWhenUnset, missingRequired, placeholders, refusalLines } from "./apps/web/e2e/env.mjs";

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
 * **The suite either has what it needs or says what it does not.**
 *
 * Nothing loads the root `.env` into a Node process, so `pnpm e2e` in a fresh shell used to start
 * an app with no `BETTER_AUTH_SECRET` and fail eleven tests on `Something went wrong.` — a wrong
 * answer with no reason attached, which `gates.mjs` gave its own gates the placeholders to avoid and
 * this door never got. It is not only an annoyance: the unattended runner reads an unexplained
 * failure as a blocker and stops, so this parked the loop on its first epic.
 *
 * Done here rather than in a `globalSetup` because this runs **before** the web server does: the
 * refusal costs a second instead of arriving after a two-minute production build.
 *
 * `apps/web/e2e/env.mjs` holds the values and the reasoning. Both steps are deliberately noisy —
 * filling in a signing secret in silence would be a quieter version of the same defect.
 */
const missing = missingRequired(process.env);
if (missing.length > 0) {
  for (const line of refusalLines(missing)) console.error(line);
  process.exit(2);
}
const applied = applyWhenUnset(process.env, placeholders(port));
if (applied.length > 0) {
  console.log(`[e2e] not set, so using ci.yml's placeholders: ${applied.join(", ")}`);
}

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
  /**
   * Remove `run-suite` jobs whose run no longer exists, before anything starts.
   *
   * Specs that trigger a run without a worker leave jobs on the queue, and the first spec that
   * *does* start one drains them inside its own timeout — which is how an unrelated `activation`
   * failure gets caused by the previous run. `apps/web/e2e/global-setup.ts` has the mechanism and
   * the three observations behind it.
   */
  globalSetup: "./apps/web/e2e/global-setup.ts",
  testIgnore: capturing ? [] : ["**/capture/**"],
  /**
   * Playwright's own default, plus one that says what the run **skipped**.
   *
   * The first entry restates the default rather than changing it — `list` locally, `dot` under `CI`
   * — because naming a reporter replaces the default outright, and quietly losing the per-test
   * output would be a worse trade than the line it took to keep it.
   *
   * The second is `docs/PROCESS.md`'s failure 4. The four visual-regression tests skip on macOS and
   * the suite exits 0 reporting `4 skipped` next to `178 passed`, which reads as a pass; CI #206 was
   * a layout change that survived every local run because of it. `apps/web/e2e/skips.ts` has the
   * reasoning and the two verdicts.
   */
  reporter: [[process.env.CI ? "dot" : "list"], ["./apps/web/e2e/skip-reporter.ts"]],
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
       * **The browser suite does not rate-limit itself into failing.**
       *
       * Better Auth allows 100 `/api/auth/*` requests a minute per IP and 15 magic links per five
       * minutes; a serial suite of two hundred tests on one machine is one IP that exceeds both.
       * When it trips, the magic-link verify returns 429 and simply does not redirect, which reads
       * as a broken sign-in rather than as a rate limit — it cost EPIC-032 two rounds of diagnosis.
       *
       * `apps/web/lib/auth.ts`'s `rateLimitEnabled` carries the three guards on this flag and the
       * reason it is safe: it is refused in production, it appears nowhere in `infra/`, and the
       * process announces it at startup. `auth.rate-limit.test.ts` never sets it, so both limits
       * are still asserted against a real database.
       */
      E2E_RATE_LIMIT_OFF: "1",
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
