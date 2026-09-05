import { defineConfig } from "vitest/config";

export default defineConfig({
  // globals:true lets @testing-library/react auto-register its afterEach(cleanup) — otherwise
  // multiple render()s across it() blocks in one file leak DOM nodes into later assertions.
  test: { environment: "jsdom", globals: true, setupFiles: ["./vitest.setup.ts"] }
});
