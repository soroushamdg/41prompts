/**
 * The consent cookie's name, in a module with no server imports.
 *
 * It lived in `posthog-server.ts`, which pulls in `posthog-node` and `next/headers`; importing that
 * from a client component drags a server-only dependency into the browser bundle. One constant, one
 * home, importable from both sides — `posthog-server.ts` re-exports it so nothing that already read
 * it there has to change.
 */
export const CONSENT_COOKIE_NAME = "41prompts_analytics_consent";
