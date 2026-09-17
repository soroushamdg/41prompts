import { headers } from "next/headers";
import { DEFAULT_RUN_MODEL } from "@41prompts/db";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sameOrigin } from "@/lib/deploy/origin";
import { publishVersion } from "@/lib/deploy/publish";
import { gateBody, refusalBody } from "@/lib/deploy/words";

/**
 * `POST /api/prompts/:promptId/publish` — move a version to Live (EPIC-051).
 *
 * ## Why this is a route handler and not a server action
 *
 * Every other mutation in this app is a server action. These two are endpoints, for three reasons
 * (EPIC-051 ruling 5): `docs/roadmap.md` names them as `POST …/publish` and `POST …/undo`; **409
 * with reasons** is in its test list and an action returns a value rather than a status; and a server
 * action has no caller until EPIC-055's Deploy page exists, which would leave this epic's central
 * behaviour reachable only from a unit test. A route handler can be driven against the **built** app
 * with the cookie a real sign-in produced, which is the whole of the browser-drive rule.
 *
 * ## Body
 *
 * ```
 * { "versionId"?: string, "reason"?: string }
 * ```
 *
 * `versionId` omitted publishes the newest version. `reason` present makes this **Publish anyway**:
 * it is recorded with the gate it went past, per `CLAUDE.md` rule 9. Sending a reason when the gate
 * is not stopping anything is allowed and is recorded as an ordinary publish — a person who typed
 * one has said something worth keeping.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ promptId: string }> }): Promise<Response> {
  if (!sameOrigin(request)) {
    return Response.json({ error: "bad_origin", says: "That request did not come from this site." }, { status: 403 });
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (session === null) {
    return Response.json({ error: "not_signed_in", says: "Sign in to publish." }, { status: 401 });
  }

  const body = await readBody(request);
  if (body === undefined) {
    return Response.json({ error: "bad_body", says: "That request body could not be read." }, { status: 400 });
  }

  const { promptId } = await context.params;
  const outcome = await publishVersion({
    db: getDb(),
    promptId,
    owner: session.user.id,
    ...(body.versionId === undefined ? {} : { versionId: body.versionId }),
    ...(body.reason === undefined ? {} : { anywayReason: body.reason }),
    // The model the checks must have been proved against. One model today; EPIC-055's Deploy page is
    // where a person picks it, and this reads a body field the moment that exists.
    targetModel: DEFAULT_RUN_MODEL,
  });

  if (!outcome.ok) {
    const { status, body: refusal } = refusalBody(outcome.refusal);
    return Response.json(refusal, { status, headers: { "cache-control": "no-store" } });
  }

  const { event, artifact, report, markerUrl, artifactUrl } = outcome.value;
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
      gate: gateBody(report),
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

interface PublishBody {
  versionId?: string;
  reason?: string;
}

/**
 * The body, or undefined when it is not one.
 *
 * An empty body is `{}` — publishing the newest version with no reason is the ordinary case and
 * should not require a caller to send two braces.
 */
async function readBody(request: Request): Promise<PublishBody | undefined> {
  const text = await request.text();
  if (text.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const { versionId, reason } = parsed as Record<string, unknown>;
  if (versionId !== undefined && typeof versionId !== "string") return undefined;
  if (reason !== undefined && typeof reason !== "string") return undefined;
  return {
    ...(typeof versionId === "string" ? { versionId } : {}),
    ...(typeof reason === "string" ? { reason } : {}),
  };
}
