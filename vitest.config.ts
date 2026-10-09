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
    env: {
      NEXT_PUBLIC_APP_URL: "https://app.41prompts.ai",
      NEXT_PUBLIC_SITE_URL: "https://41prompts.ai",
    },
  },
});
