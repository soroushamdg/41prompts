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

// Serial, single worker: the magic-link rate limit (lib/auth.ts) is keyed per IP in an
// in-memory store shared by every request the dev server handles. Parallel workers hitting
// the same server would share that budget and make the suite flaky depending on run order.
export default defineConfig({
  testDir: "./apps/web/e2e",
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
  },
});
