import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs, run only by the root `pnpm e2e` — vitest's default glob
    // would otherwise also try (and fail) to collect them as unit tests.
    exclude: ["**/node_modules/**", "e2e/**"]
  }
});
