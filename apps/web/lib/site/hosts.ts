/**
 * Which host serves what, and where a request on the wrong one is sent.
 *
 * Two hosts, one deployment:
 *
 * - **the apex** (`41prompts.ai`) is the public product: the landing page, the decompiler, shared
 *   permalinks, the guide, and the files that describe the site to crawlers. Indexable.
 * - **`app.`** is everything behind or adjacent to a session: `/app/*`, sign-in, sign-up and the
 *   auth API. Nothing on it is indexable.
 *
 * A request for the wrong kind of path on either host is **301**ed to the same path on the other, so
 * a search engine settles on one host per page rather than splitting its opinion between two.
 *
 * **This table is the single source of truth** — the proxy redirects from it, `robots.ts` disallows
 * from it, and `host-split.test.ts` asserts every route in `app/` is classified by exactly one rule.
 * Two lists would disagree the first time a route is added.
 */

/**
 * Paths that belong on `app.`. Prefix match, and order does not matter — they do not overlap.
 *
 * `/api/prompts` is EPIC-051's publish and undo endpoints. They are authenticated by the **session
 * cookie** and called from the Deploy page, so they belong wherever that page is; and the cookie is
 * scoped to `app.`, so serving them on the apex would be serving an endpoint that can never
 * authenticate anybody.
 */
export const APP_PATHS: readonly string[] = ["/app", "/sign-in", "/sign-up", "/api/auth", "/api/prompts"];

/**
 * Paths that belong on the apex but are not otherwise obvious — everything not in `APP_PATHS` is
 * marketing by default, so this list exists only for the test's benefit and for documentation.
 */
export const PUBLIC_PATHS: readonly string[] = [
  "/",
  "/decompile",
  "/d",
  "/guides",
  // The five EPIC-072 added. They are marketing by default like everything else here, and the
  // reason the list is written out is that `hosts.test.ts` walks `app/` and fails on a route nobody
  // classified — which is how these arrived in this list rather than being noticed on staging.
  "/features",
  "/delivery",
  "/docs",
  "/security",
  "/changelog",
  // EPIC-072b's two, and `hosts.test.ts` is what found they were missing — not staging, not the
  // e2e walk, not the sitemap. Both were already served correctly, because everything outside
  // `APP_PATHS` is marketing by default; what was missing was the classification, which is the
  // thing this list exists to make explicit. The guard fired within a minute of the pages being
  // written, which is the argument for having written it out rather than deriving it.
  "/about",
  "/careers",
  "/legal",
  "/contact",
  "/waitlist",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image"
];

/**
 * Served on **both** hosts, unredirected.
 *
 * `/healthz` because a health check that 301s is a health check that reports on the redirect rather
 * than on the app, and both hosts are the same container anyway. `/_next` and the dev routes because
 * redirecting an asset request breaks the page that asked for it.
 *
 * **`/v1` for the same reason, and it is the one that will matter most** (EPIC-051). It is called by
 * a customer's program holding a project-scoped key, not by a browser, and a 301 to a program is
 * either a wasted round trip on every resolve or — for a client that does not follow redirects, which
 * `@41prompts/sdk` may well not, since it must never block a call — an outright failure. Whatever
 * base URL somebody configures, the answer has to be the answer.
 */
export const SHARED_PATHS: readonly string[] = ["/healthz", "/_next", "/dev", "/favicon.ico", "/icon.svg", "/v1"];

function matches(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isSharedPath(pathname: string): boolean {
  return matches(pathname, SHARED_PATHS);
}

/** Whether this path belongs on the `app.` host. Everything else is public. */
export function isAppPath(pathname: string): boolean {
  return matches(pathname, APP_PATHS);
}

/**
 * The two hosts for this deployment, derived from one configured pair.
 *
 * `PUBLIC_SITE_URL` is the apex and `BETTER_AUTH_URL` is the app host — both already have to be set
 * correctly for other reasons, so there is no third thing to keep in step. Staging uses
 * `staging.41prompts.ai` / `app.staging.41prompts.ai`; local development sets neither and gets no
 * redirects at all, which is what makes `localhost:3000` keep working.
 */
export interface HostPair {
  readonly publicOrigin: string;
  readonly appOrigin: string;
}

function normalise(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return value.replace(/\/+$/, "");
}

function hostPair(): HostPair | undefined {
  const publicOrigin = normalise(process.env.PUBLIC_SITE_URL);
  const appOrigin = normalise(process.env.BETTER_AUTH_URL);
  if (publicOrigin === undefined || appOrigin === undefined) return undefined;
  // One host, or a local setup: nothing to split, so nothing to redirect.
  if (publicOrigin === appOrigin) return undefined;
  return { publicOrigin, appOrigin };
}

/**
 * Where a request should be sent, or `undefined` to serve it here.
 *
 * Takes the host as a string rather than reading it, so the whole rule is a pure function the tests
 * can enumerate.
 */
export function redirectTarget(currentHost: string, pathname: string, search: string): string | undefined {
  const pair = hostPair();
  if (pair === undefined) return undefined;
  if (isSharedPath(pathname)) return undefined;

  const host = currentHost.toLowerCase();
  const publicHost = new URL(pair.publicOrigin).host.toLowerCase();
  const appHost = new URL(pair.appOrigin).host.toLowerCase();

  // A host we do not recognise — a preview URL, a direct container hit, an IP — is served as-is.
  // Redirecting it would send somebody somewhere they did not ask to go on the strength of a
  // `Host` header, which is attacker-controllable.
  const onPublic = host === publicHost;
  const onApp = host === appHost;
  if (!onPublic && !onApp) return undefined;

  const wantsApp = isAppPath(pathname);
  if (wantsApp && onPublic) return `${pair.appOrigin}${pathname}${search}`;
  if (!wantsApp && onApp) return `${pair.publicOrigin}${pathname}${search}`;
  return undefined;
}
