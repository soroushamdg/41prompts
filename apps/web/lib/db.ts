import { createDb, type Db } from "@41prompts/db";

// Lazy: `next build` imports every route/page module to collect its config, which would run
// this at build time if it were a top-level side effect — and the build container never has
// DATABASE_URL (that's a Coolify runtime env var, injected via env_file at container start,
// not present in the GitHub Actions image build). Confirmed by reproducing the build failure
// locally with the var unset before making this lazy.
let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    cached = createDb(databaseUrl);
  }
  return cached;
}
