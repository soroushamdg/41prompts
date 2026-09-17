import { databaseStore, storeFor } from "@/lib/deploy/store";

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
 * A key is a **32-hex content hash** or a prompt id, so the object being served is one somebody was
 * told about by a marker they were entitled to read.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }): Promise<Response> {
  const store = await storeFor();
  // When R2 is configured, the marker names the CDN and nothing should be asking this route for
  // bytes. Answering anyway would make this a second, unmeasured way to read the store.
  if (store.name !== "database") return new Response("Not found", { status: 404 });

  const { key } = await context.params;
  const object = await databaseStore.get(key.map(decodeURIComponent).join("/"));
  if (object === undefined) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.contentType,
      "cache-control": object.cacheControl,
      // The same digest the artifact is addressed by. A conditional request can then be answered
      // without the body, which is what a CDN in front of R2 would do with R2's own ETag.
      etag: `"${key[key.length - 1]?.replace(/\.json$/, "") ?? ""}"`,
    },
  });
}
