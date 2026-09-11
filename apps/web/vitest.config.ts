import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The same `@/*` → app root alias `tsconfig.json` gives the app itself. Without it a test that
  // imports a page fails at resolution rather than at an assertion, which reads like the page is
  // broken when it is the runner that cannot find it.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs, run only by the root `pnpm e2e` — vitest's default glob
    // would otherwise also try (and fail) to collect them as unit tests.
    exclude: ["**/node_modules/**", "e2e/**"]
  }
});
