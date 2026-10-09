import { defineConfig, devices } from "@playwright/test";

/* e2e runs the BUILT app (next build + next start), never the dev server, on
   port 3142 with its own dist dir and the Neon e2e branch. Port 3000 belongs
   to another project on this machine, so nothing here reuses a running server. */

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env: CI-style run with explicit env */
}

const PORT = 3142;
const APP_URL = `http://localhost:${PORT}`;
const SITE_URL = `http://site.localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `${APP_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: "pipe",
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_URL: APP_URL,
      NEXT_PUBLIC_SITE_URL: SITE_URL,
      MAINTENANCE_MODE: "0",
      E2E_MODE: "1",
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
      DATABASE_URL_UNPOOLED: process.env.E2E_DATABASE_URL ?? "",
    },
  },
});

export { APP_URL, SITE_URL };
