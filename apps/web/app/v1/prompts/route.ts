import { liveForProject } from "@41prompts/db";
import { getDb } from "@/lib/db";
import { keyFromRequest, refusalResponse } from "@/lib/deploy/api-auth";
import { markerKey, storeFor } from "@/lib/deploy/store";
import { limitV1, rateLimitedResponse } from "@/lib/deploy/v1-limits";

/**
 * `GET /v1/prompts` — the prompts a key can see, and what is Live for each (EPIC-051).
 *
 * Key-authenticated, **scoped to the key's own project**. There is no way to ask about another
 * project from here: the project is taken from the key rather than from a parameter, so there is no
 * parameter to get wrong and no scope check that could be forgotten.
 *
 * `no-store`, because the answer depends on which key asked. A shared cache in front of this would
 * eventually serve one customer's list to another, and that is not a risk worth a cache on a route
 * that is called once at process start.
 *
 * Rate limited on the same two buckets as the other three (EPIC-057, `lib/deploy/v1-limits.ts`).
 * "Called once at process start" is a description of a well-behaved caller, not a property of the
 * route.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  const auth = await keyFromRequest(db, request);
  const limit = limitV1(request, auth.ok ? auth.key.id : null);
  if (!limit.allowed) return rateLimitedResponse(limit);
  if (!auth.ok) return refusalResponse(auth.status, auth.reason);

  const store = await storeFor();
  const rows = await liveForProject(db, auth.key.project);

  return Response.json(
    {
      environment: auth.key.environment,
      prompts: rows.map((row) => ({
        id: row.id,
        name: row.name,
        live:
          row.live === undefined
            ? null
            : {
                buildHash: row.live.buildHash,
                version: row.live.versionN,
                publishedAt: row.live.createdAt.toISOString(),
                markerUrl: store.publicUrl(markerKey(row.id)),
              },
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
