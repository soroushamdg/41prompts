import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // Each database test file boots its own in-process Postgres (PGlite).
    hookTimeout: 60_000,
    testTimeout: 30_000,
    maxWorkers: 4,
    env: {
      NEXT_PUBLIC_APP_URL: "https://app.41prompts.ai",
      NEXT_PUBLIC_SITE_URL: "https://41prompts.ai",
    },
  },
});
