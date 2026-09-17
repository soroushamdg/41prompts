import { apiKeyForPlaintext, markApiKeyUsed, type ApiKeyRow, type Db } from "@41prompts/db";

/**
 * Authenticating a `/v1` request (EPIC-051).
 *
 * A key, in `Authorization: Bearer 41p_live_…`. No session, no cookie, no origin — these routes are
 * called by a program on somebody's server, and a program has no origin to check.
 *
 * ## The two refusals are different on purpose
 *
 * **401** is "you did not present a usable key". **403** is "your key is for another project" — the
 * roadmap's `wrong-scope key → 403`.
 *
 * This is the opposite of the house rule for the app's own routes, where a prompt that is not yours
 * is **404** so that a 403 cannot confirm an id exists. The difference is who is asking: an app route
 * is reachable by anybody with a browser, while reaching here at all means holding one of our keys —
 * and an SDK that gets 404 for "wrong project" cannot tell a configuration mistake from a deleted
 * prompt, which is the single most likely thing to go wrong when somebody wires this up.
 */

export type KeyAuth =
  | { ok: true; key: ApiKeyRow }
  | { ok: false; status: 401; reason: "missing_key" | "unknown_key" };

const BEARER = /^Bearer\s+(\S+)$/i;

/** The key a request presented, or the refusal to return. Does not touch `last_used_at`. */
export async function keyFromRequest(db: Db, request: Request): Promise<KeyAuth> {
  const header = request.headers.get("authorization");
  const match = header === null ? null : BEARER.exec(header);
  if (match === null) return { ok: false, status: 401, reason: "missing_key" };

  const key = await apiKeyForPlaintext(db, match[1] ?? "");
  // A revoked key resolves to nothing, so it is indistinguishable from a wrong one here. Deliberate:
  // "that key used to work" is information about our side of the relationship, not theirs.
  if (key === undefined) return { ok: false, status: 401, reason: "unknown_key" };

  // Best effort, and deliberately not awaited into the request's critical path's failure mode: a
  // write failure here must not fail the read it describes.
  void markApiKeyUsed(db, key.id).catch(() => undefined);

  return { ok: true, key };
}

/** JSON for a refusal. The body never says which of the two 401 reasons it was. */
export function refusalResponse(status: 401 | 403 | 404, code: string): Response {
  return Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });
}
