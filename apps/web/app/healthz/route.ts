import { NextResponse } from "next/server";

// Evaluated per request, not cached at build time, so this stays a real liveness probe
// once it grows beyond static build-time values (e.g. a DB ping).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    // Field is `commit`, not `sha` (CURRENT.md's literal wording): ADR-003 forbids "sha" in
    // code identifiers with no UI-only carve-out, unlike assertion/artifact. See the report.
    commit: process.env.COMMIT_SHA ?? "unknown",
    env: process.env.DEPLOY_ENV ?? "development"
  });
}
