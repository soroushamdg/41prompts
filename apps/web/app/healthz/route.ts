import { NextResponse } from "next/server";

// Evaluated per request, not cached at build time, so this stays a real liveness probe
// once it grows beyond static build-time values (e.g. a DB ping).
export const dynamic = "force-dynamic";

export function GET() {
  // COMMIT_SHA is always *set* (the Dockerfile's ARG defaults it to the literal string
  // "unknown"), so a plain `??` fallback would never reach SOURCE_COMMIT — "unknown" isn't
  // nullish, it's a real value that happens to mean "no real value". Treat it as the
  // sentinel it is: prefer COMMIT_SHA only once it's something other than that placeholder,
  // otherwise fall back to SOURCE_COMMIT, which Coolify sets directly on the running
  // container at deploy time (confirmed by reading ApplicationDeploymentJob.php on the box)
  // whenever no application environment variable of that name exists — independent of
  // whatever build-arg the image was actually built with.
  const commit =
    process.env.COMMIT_SHA && process.env.COMMIT_SHA !== "unknown"
      ? process.env.COMMIT_SHA
      : (process.env.SOURCE_COMMIT ?? "unknown");

  return NextResponse.json({
    ok: true,
    // Field is `commit`, not `sha` (CURRENT.md's literal wording): ADR-003 forbids "sha" in
    // code identifiers with no UI-only carve-out, unlike assertion/artifact. See the report.
    commit,
    env: process.env.DEPLOY_ENV ?? "development"
  });
}
