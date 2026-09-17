import { getObject, putObject, type StoredObject } from "@41prompts/db";
import { getDb } from "@/lib/db";

/**
 * Where a published artifact lives (EPIC-051).
 *
 * ## One interface, two drivers, and the second one exists because the first has no bucket
 *
 * `docs/roadmap.md` says artifacts go to R2 with immutable headers. **No artifact bucket exists** —
 * creating one and putting Cloudflare in front of it is a step only Soroush can take — and a store
 * that only works in production is a store nothing can test, drive or develop against.
 *
 * So `storeFor()` picks: R2 when every `R2_*` value is present, and the database otherwise. The
 * database driver is not a stub. It is durable, shared between web replicas, backed up nightly by
 * `infra/backup.sh`, and it serves the same bytes with the same cache headers through `/v1/blob`.
 * What it is not is a CDN, which is the whole reason the other driver exists.
 *
 * ## Keys carry the environment
 *
 * `<DEPLOY_ENV>/artifacts/<buildHash>.json` and `<DEPLOY_ENV>/markers/<promptId>.json`.
 *
 * `docs/backlog.md`'s EPIC-006d row is the argument: staging and production already share one R2
 * bucket and one prefix for Postgres dumps, so *"neither environment's backups are distinguishable,
 * isolated, or safe from the other's prune"*. Starting a second object class the same way would be
 * repeating a known defect deliberately. It is a prefix rather than two buckets because a prefix
 * needs no second credential to exist, and the credential split is EPIC-006d's to make.
 */

/**
 * A year, and `immutable`.
 *
 * An artifact's key is its own content hash, so the bytes at a key can never legitimately change —
 * which is exactly the promise `immutable` makes to every cache between R2 and a customer's process:
 * do not revalidate, ever. `docs/decisions/ADR-005-build-artifact.md` §1 is what makes that true.
 */
export const ARTIFACT_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Thirty seconds, from `docs/roadmap.md`'s "pointer with 30 s max-age".
 *
 * The marker is the one mutable document in this system, and its max-age is the product's promise
 * that *"every app picks it up within a minute"*. Thirty is that minute with room for one stale
 * hop; a longer value would make Undo — the thing offered as instant — not instant.
 */
export const MARKER_CACHE_CONTROL = "public, max-age=30";

export const ARTIFACT_CONTENT_TYPE = "application/json";

/** `development` when nothing says otherwise, matching `/healthz`'s own fallback. */
export function deployEnv(): string {
  return process.env.DEPLOY_ENV ?? "development";
}

export function artifactKey(buildHash: string): string {
  return `${deployEnv()}/artifacts/${buildHash}.json`;
}

export function markerKey(promptId: string): string {
  return `${deployEnv()}/markers/${promptId}.json`;
}

export interface ArtifactStore {
  /** What this store is, for a report and for `/healthz`-shaped answers. Never a secret. */
  readonly name: "database" | "r2";
  put(object: StoredObject, options: { immutable: boolean }): Promise<void>;
  get(key: string): Promise<StoredObject | undefined>;
  /**
   * Where a reader fetches this key from.
   *
   * **Absolute for R2, relative for the database.** A relative URL is the honest answer when the
   * bytes are served by this application: it is correct under every host the app answers on, and it
   * cannot encode a hostname that a redeploy or a custom domain would make wrong.
   */
  publicUrl(key: string): string;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Where a reader fetches an object from — the CDN in front of the bucket, without a trailing `/`. */
  publicBase: string;
  /**
   * An S3 endpoint to use instead of the account's R2 one.
   *
   * **Only a test sets this**, and it is here rather than read from the environment so that a
   * deployment cannot be pointed at somebody else's endpoint by setting a variable. `r2-store.test.ts`
   * uses it to stand a fake S3 up on a real socket; nothing in `r2ConfigFromEnv` can produce it.
   */
  endpointOverride?: string;
}

/**
 * The R2 configuration, or undefined when it is not fully present.
 *
 * **All or nothing.** A half-configured bucket is the worst of the three states: writes that look
 * like they worked, against a credential that is not there. `infra/backup.sh` takes the same
 * position with its `: "${R2_ACCOUNT_ID:?…}"` guards.
 */
export function r2ConfigFromEnv(env: Record<string, string | undefined> = process.env): R2Config | undefined {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucket = env.R2_BUCKET_ARTIFACTS;
  const publicBase = env.R2_PUBLIC_BASE_ARTIFACTS;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return undefined;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase: publicBase.replace(/\/+$/, "") };
}

/** The database driver. Rows in `published_artifacts`, served by `/v1/blob`. */
export const databaseStore: ArtifactStore = {
  name: "database",
  async put(object, options) {
    await putObject(getDb(), object, options);
  },
  async get(key) {
    return getObject(getDb(), key);
  },
  publicUrl(key) {
    // Every segment is hex or a known id, so this only ever escapes the separators. Encoded anyway:
    // a key that cannot round-trip through a URL is a key whose object nobody can fetch.
    return `/v1/blob/${key.split("/").map(encodeURIComponent).join("/")}`;
  },
};

/**
 * Which store this process uses.
 *
 * Resolved per call rather than at module load, because `next build` evaluates modules in a
 * container that has none of these values and a store captured then would be the wrong one for ever
 * — the same trap `getAuth()` documents for `DATABASE_URL`.
 */
export async function storeFor(): Promise<ArtifactStore> {
  const config = r2ConfigFromEnv();
  if (config === undefined) return databaseStore;
  // Imported lazily so that a deployment with no bucket never loads the S3 client at all.
  const { r2Store } = await import("./r2-store");
  return r2Store(config);
}
