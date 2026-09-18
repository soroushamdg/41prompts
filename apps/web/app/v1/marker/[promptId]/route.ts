import { liveFor, promptById } from "@41prompts/db";
import { getDb } from "@/lib/db";
import { keyFromRequest, refusalResponse } from "@/lib/deploy/api-auth";
import { markerKey, storeFor } from "@/lib/deploy/store";
import { limitV1, rateLimitedResponse } from "@/lib/deploy/v1-limits";

/**
 * `GET /v1/marker/:promptId` — where this prompt's Live marker is served from (EPIC-051).
 *
 * ## It is `marker`, not `pointer`
 *
 * `docs/roadmap.md` says `GET /v1/pointer/:id`. `CLAUDE.md`'s Vocabulary section forbids **pointer**
 * in "UI strings, schema, or code identifiers" with no UI-only carve-out, and **a URL path in a
 * public API is the most permanent string this product will ever publish** — an installed SDK keeps
 * requesting it years after anything else could be renamed. The type is already `LiveMarker`, from
 * the same conflict resolved the same way in EPIC-050, and the mockup's own copy says *"Publish
 * moves the Live marker"*. EPIC-051 ruling 1.
 *
 * ## It redirects rather than proxying
 *
 * `docs/roadmap.md`: *"redirect to CDN"*. The artifact and the marker are meant to be fetched from a
 * CDN, not from this application — proxying them would put the whole of a customer's runtime traffic
 * through a Next server, which is the thing the immutable cache header exists to avoid. The redirect
 * itself is short-lived; what it names is cached.
 *
 * 404 for a prompt in this key's project that has never been published, and **403** for one that is
 * not. They are different answers deliberately: see `api-auth.ts` for why `/v1` does not use the
 * app's 404-for-everything rule.
 *
 * ## It is rate limited (EPIC-057)
 *
 * This is the route `docs/roadmap.md`'s Tests line names, because it is the one an installed SDK
 * calls on a timer for ever. `lib/deploy/v1-limits.ts` carries the two buckets, the numbers, and the
 * reason the limit is counted **after** authentication rather than before it (ruling 12): a gate in
 * front of `keyFromRequest` could not tell a customer from a stranger, so anyone could have spent a
 * shared egress address's budget and locked out that customer's whole fleet.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ promptId: string }> }): Promise<Response> {
  const db = getDb();
  const auth = await keyFromRequest(db, request);
  const limit = limitV1(request, auth.ok ? auth.key.id : null);
  if (!limit.allowed) return rateLimitedResponse(limit);
  if (!auth.ok) return refusalResponse(auth.status, auth.reason);

  const { promptId } = await context.params;
  const prompt = await promptById(db, promptId);
  if (prompt === undefined) return refusalResponse(404, "no_such_prompt");
  if (prompt.project !== auth.key.project) return refusalResponse(403, "wrong_project");

  const live = await liveFor(db, promptId);
  if (live === undefined) return refusalResponse(404, "not_published");

  const store = await storeFor();
  return Response.redirect(new URL(store.publicUrl(markerKey(promptId)), request.url), 302);
}
