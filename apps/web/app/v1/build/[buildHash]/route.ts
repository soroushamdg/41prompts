import { buildWasPublished } from "@41prompts/db";
import { getDb } from "@/lib/db";
import { keyFromRequest, refusalResponse } from "@/lib/deploy/api-auth";
import { buildKey, storeFor } from "@/lib/deploy/store";

/**
 * `GET /v1/build/:buildHash` — where this artifact's bytes are served from (EPIC-052).
 *
 * ## Why it exists
 *
 * A Live marker carries a `buildHash` and, deliberately, **no URL**. `artifact/schema.ts` says why:
 * *"where an artifact is served from is an operational fact that changes with a bucket, a CDN or a
 * region, and a marker that embedded one would be a frozen copy of a decision somebody will make
 * again"*.
 *
 * So a reader holding a marker has an identity and no address. Without this route the SDK would have
 * to derive one — `…/markers/<id>.json` → `…/builds/<hash>.json` — which is a copy of
 * `lib/deploy/store.ts`'s key layout inside a package that ships to customers and is never upgraded.
 * The first time that layout changes, every installed SDK in the field breaks. EPIC-052 ruling 1.
 *
 * It is the mirror of `/v1/marker/:promptId`: same authentication, same redirect, same reason.
 *
 * ## There is no project check, and that is deliberate
 *
 * `/v1/marker/:promptId` 403s a prompt in another project because a prompt **id** is short, guessable
 * and names something private. A `buildHash` is neither: it is a SHA-256 content address, and the
 * object it names is **public** — ADR-005 §1 says so in as many words, and `/v1/blob` serves those
 * bytes with no key at all because a CDN in front of R2 will have none either.
 *
 * Adding a check here would be a guard that exists in one deployment and not the other, which
 * `/v1/blob`'s own comment names as *"worse than none because it is believed"*. The key gates access
 * to the API; the content address gates which object; the artifact is public by design.
 *
 * ## 404 is asked of the audit log, not of the store
 *
 * `publish_events` is the record of what this system made public. A key that exists in a bucket but
 * that no event names is another environment's object or somebody's guess, and answering for it
 * would make this route a second, unmeasured way to read the store.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ buildHash: string }> }): Promise<Response> {
  const db = getDb();
  const auth = await keyFromRequest(db, request);
  if (!auth.ok) return refusalResponse(auth.status, auth.reason);

  const { buildHash } = await context.params;
  if (!(await buildWasPublished(db, buildHash))) return refusalResponse(404, "no_such_build");

  const store = await storeFor();
  return Response.redirect(new URL(store.publicUrl(buildKey(buildHash)), request.url), 302);
}
