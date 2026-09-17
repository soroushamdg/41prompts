import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameOrigin } from "@/lib/deploy/origin";
import { undoPublish } from "@/lib/deploy/publish";
import { refusalBody } from "@/lib/deploy/words";

/**
 * `POST /api/prompts/:promptId/undo` — put the previous version back (EPIC-051).
 *
 * ## The reason is required
 *
 * `docs/roadmap.md` attaches its ≥10-character rule only to "Publish anyway". The mockup's publish
 * history shows a rollback carrying one — *"Rolled back · v5 · Rambod A. · latency spike on Gemini"*
 * — and `CLAUDE.md` makes the mockups the spec for product behaviour. EPIC-051 ruling 3.
 *
 * The reason it is right rather than merely sourced: an undo moves Live for every app in the field,
 * without a deploy, during an incident. *"Why did Live move"* is what this log exists to answer, and
 * that is the one moment nobody writes it down voluntarily.
 *
 * Body: `{ "reason": string }`.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ promptId: string }> }): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "bad_origin", says: "That request did not come from this site." }, { status: 403 });
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session === null) {
    return Response.json({ error: "not_signed_in", says: "Sign in to undo." }, { status: 401 });
  }

  let reason: unknown;
  try {
    reason = (JSON.parse(await request.text()) as Record<string, unknown>).reason;
  } catch {
    return Response.json({ error: "bad_body", says: "That request body could not be read." }, { status: 400 });
  }
  if (typeof reason !== "string") {
    return Response.json({ error: "bad_body", says: "Say why you are undoing this." }, { status: 400 });
  }

  const { promptId } = await context.params;
  const outcome = await undoPublish({ db: getDb(), promptId, owner: session.user.id, reason });

  if (!outcome.ok) {
    const { status, body } = refusalBody(outcome.refusal);
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }

  const { event, artifact, markerUrl, artifactUrl } = outcome.value;
  return Response.json(
    {
      live: {
        buildHash: artifact.buildHash,
        version: event.versionN,
        kind: event.kind,
        publishedAt: event.createdAt.toISOString(),
        markerUrl,
        artifactUrl,
      },
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
