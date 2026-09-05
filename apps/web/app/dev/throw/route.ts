import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Deliberately throws so the Sentry pipeline (EPIC-004) can be proven end-to-end against a real
// deploy: hit this route, then confirm the issue appears in Sentry tagged with the release and
// environment. Same DEPLOY_ENV gate as /dev/ui — dev and staging only, never in production.
export function GET(): NextResponse {
  if (process.env.DEPLOY_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  throw new Error("EPIC-004 /dev/throw: deliberate error to verify the Sentry pipeline");
}
