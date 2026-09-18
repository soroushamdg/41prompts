import { sha256Text } from "@41prompts/core";
import { databaseStore, storeFor } from "@/lib/deploy/store";
import { limitV1Blob, rateLimitedResponse } from "@/lib/deploy/v1-limits";

/**
 * `GET /v1/blob/<key>` — the bytes, when the artifact store is this database (EPIC-051).
 *
 * ## Why this route exists
 *
 * There is no artifact bucket and no CDN; creating them is Soroush's step. Until then the store is
 * `published_artifacts` and something has to serve what it holds — otherwise the marker would name a
 * URL nothing answers, and none of publishing could be driven, tested or developed against.
 *
 * **It serves the same cache headers the R2 objects carry**, read from the row rather than re-decided
 * here, which is what makes criterion C11 a measurement of a real HTTP response instead of an
 * assertion about a string.
 *
 * ## No authentication, deliberately
 *
 * An artifact is public. ADR-005 §1 says so in as many words: it is served from a CDN without a
 * session, and *"anything in an artifact is public"* — which is why `leak.test.ts` exists and why
 * nothing in the format names a person, an account or a cost. Adding a key check here would be a
 * guard the CDN will not have, and a guard that exists in one environment and not the other is worse
 * than none because it is believed.
 *
 * A key is a **content hash** or a prompt id, so the object being served is one somebody was told
 * about by a marker they were entitled to read.
 *
 * ## The ETag is derived from the body, and EPIC-052 found out why that matters
 *
 * It used to be derived from the **key**. For an artifact that is the same thing — the key is the
 * content hash — and for a **marker** it was a defect with no symptom: a marker's key is its prompt
 * id, which never changes, so its ETag never changed either. Nothing had noticed because this route
 * did not implement `If-None-Match` at all, so no conditional request was ever answered.
 *
 * `@41prompts/sdk` sends one on every background refresh. With a constant ETag the first 304 would
 * have been permanent: **a published version would never reach a running application again**, and
 * the failure would have looked like the SDK ignoring a publish rather than like a cache header. R2
 * computes its own ETag from content and would have been right all along, so the two drivers would
 * also have disagreed — one of them silently.
 *
 * Hashing the body per request is affordable because this route exists only where there is no CDN:
 * one process, small documents, and a request rate bounded by the marker's 30-second max-age.
 *
 * ## And bounded by a rate limit as well, since EPIC-057
 *
 * "Bounded by the marker's max-age" is a statement about a well-behaved SDK, not about a stranger.
 * This is the one `/v1` route with **no key to bucket by**, so it is limited by address alone —
 * which makes it the weakest of the four, and `docs/security/sdk-threat-model.md` says so rather
 * than implying the limit is as good as the others'. A CDN in front of R2 is what actually absorbs
 * this, and there is no CDN; that is the same absence this whole route exists for.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const limit = limitV1Blob(request);
  if (!limit.allowed) return rateLimitedResponse(limit);

  const store = await storeFor();
  // When R2 is configured, the marker names the CDN and nothing should be asking this route for
  // bytes. Answering anyway would make this a second, unmeasured way to read the store.
  if (store.name !== "database") return new Response("Not found", { status: 404 });

  const { key } = await context.params;
  const object = await databaseStore.get(key.map(decodeURIComponent).join("/"));
  if (object === undefined) return new Response("Not found", { status: 404 });

  // The same digest core addresses an artifact by, over whatever this object holds. A conditional
  // request can then be answered without the body, which is what a CDN in front of R2 would do.
  const etag = `"${sha256Text(object.body)}"`;
  const headers = { "content-type": object.contentType, "cache-control": object.cacheControl, etag };

  // A strong comparison, and a list, because a client may send more than one and `*` means "any".
  const asked = request.headers.get("if-none-match");
  if (asked !== null && (asked.trim() === "*" || asked.split(",").some((one) => one.trim() === etag))) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
}
