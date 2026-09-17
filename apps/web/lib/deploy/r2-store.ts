import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StoredObject } from "@41prompts/db";
import type { ArtifactStore, R2Config } from "./store";

/**
 * The R2 driver (EPIC-051).
 *
 * ## The dependency, and why this is not hand-written
 *
 * `@aws-sdk/client-s3` is this epic's one new dependency. EPIC-050 wrote SHA-256 out by hand and the
 * reasoning there is the reason not to here: core may have **no** dependency at all, and FIPS 180-4
 * publishes vectors to prove an implementation against. Neither holds in `apps/web`. Hand-rolling
 * **AWS SigV4** — a request-signing algorithm — with no published vectors to hand would ship a
 * security-critical implementation whose only test is itself, which is precisely the shape ADR-005
 * rejects for artifact verification.
 *
 * ## It has never spoken to Cloudflare
 *
 * There is no artifact bucket. `r2-store.test.ts` points this client at a fake S3 endpoint on a real
 * socket and asserts the method, the key, the bytes and the cache header that go over it — which
 * proves everything except Cloudflare's own behaviour. The report says so rather than implying a
 * bucket was written to.
 *
 * ## Write-once is R2's to enforce, and it is asked to
 *
 * `IfNoneMatch: "*"` makes a put fail when the key already exists, which is the database driver's
 * write-once rule expressed in the protocol instead of in a `select`. A repeat of an identical
 * artifact is then a `PreconditionFailed` rather than a silent overwrite — harmless, because the key
 * *is* the content hash, so a conflict means those bytes are already published. Markers do not ask
 * for it: a marker is supposed to change.
 */
export function r2Store(config: R2Config): ArtifactStore {
  // Trimmed here as well as in `r2ConfigFromEnv`, because this value reaches an SDK as a URL and a
  // `//` in one is the kind of thing a CDN answers differently from an origin.
  const publicBase = config.publicBase.replace(/\/+$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpointOverride ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // R2 serves path-style (`/bucket/key`). Virtual-host style would need a DNS name per bucket.
    forcePathStyle: true,
  });

  return {
    name: "r2",

    async put(object: StoredObject, options: { immutable: boolean }): Promise<void> {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: object.key,
            Body: object.body,
            ContentType: object.contentType,
            CacheControl: object.cacheControl,
            ...(options.immutable ? { IfNoneMatch: "*" } : {}),
          }),
        );
      } catch (error) {
        // An immutable key that already exists holds the same bytes by construction — the key is
        // their hash — so this is a repeat, not a failure. Anything else is rethrown.
        if (options.immutable && isAlreadyThere(error)) return;
        throw error;
      }
    },

    async get(key: string): Promise<StoredObject | undefined> {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        const body = await result.Body?.transformToString();
        if (body === undefined) return undefined;
        return {
          key,
          body,
          contentType: result.ContentType ?? "application/json",
          cacheControl: result.CacheControl ?? "",
        };
      } catch (error) {
        if (isMissing(error)) return undefined;
        throw error;
      }
    },

    publicUrl(key: string): string {
      return `${publicBase}/${key.split("/").map(encodeURIComponent).join("/")}`;
    },
  };
}

/** The two ways S3 says "that key is already there" to a conditional put. */
function isAlreadyThere(error: unknown): boolean {
  return statusOf(error) === 412 || nameOf(error) === "PreconditionFailed";
}

function isMissing(error: unknown): boolean {
  return statusOf(error) === 404 || nameOf(error) === "NoSuchKey" || nameOf(error) === "NotFound";
}

function statusOf(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const meta = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
  return meta?.httpStatusCode;
}

function nameOf(error: unknown): string | undefined {
  return error !== null && typeof error === "object" ? (error as { name?: string }).name : undefined;
}
