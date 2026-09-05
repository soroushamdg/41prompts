import { defineConfig } from "@playwright/test";

// Serial, single worker: the magic-link rate limit (lib/auth.ts) is keyed per IP in an
// in-memory store shared by every request the dev server handles. Parallel workers hitting
// the same server would share that budget and make the suite flaky depending on run order.
export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "pnpm --filter @41prompts/web dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
