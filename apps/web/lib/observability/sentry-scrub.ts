import { literalSecretMatcher, scrubSecrets, secretsFromEnv } from "@41prompts/logger/src/scrub";

/**
 * The redaction Sentry runs before an event leaves this process (EPIC-043).
 *
 * ## Why Sentry needs its own hook rather than inheriting the logger's
 *
 * `packages/logger` redacts what goes to stdout. Sentry does not go through it: the SDK serialises
 * an exception, its stack, its breadcrumbs and whatever context was attached, and posts that
 * straight to a processor outside Canada. An error thrown by a provider SDK routinely echoes the
 * request it was making, and that is exactly the path a person's key would take out of the country
 * without anybody having written a line of code to send it.
 *
 * Three `Sentry.init` call sites in this repository, and before this epic **none of them had a
 * `beforeSend`**. `apps/web/sentry-hooks.test.ts` fails the build if one appears without it.
 *
 * ## The deep import is deliberate
 *
 * `@41prompts/logger/src/scrub` rather than `@41prompts/logger`: the barrel re-exports `logger.ts`,
 * which imports pino, and this module is imported by `instrumentation-client.ts` — a browser bundle.
 * `scrub.ts` has no imports at all, which is what makes it safe to pull into one.
 *
 * ## The browser gets shapes only, and that is correct
 *
 * `secretsFromEnv` finds nothing in a browser, because a browser holds none of those values and must
 * not. So a client event is matched on shape alone; a server event is matched on shape **and** on
 * this deployment's own configured secrets. The difference is a property of where the code runs,
 * not a gap — there is no literal for the browser to know.
 */

/**
 * Built once per runtime. `process.env` is read at module load on the server, which is after the
 * container has its environment and before any event exists; in the browser the call is inert.
 */
const literals = literalSecretMatcher(
  secretsFromEnv(typeof process === "undefined" ? {} : (process.env as Record<string, string | undefined>)),
);

/**
 * `beforeSend` / `beforeSendTransaction`, typed loosely on purpose.
 *
 * Sentry's `Event` type differs between `@sentry/nextjs` and `@sentry/node` and between their client
 * and server entry points. Naming a concrete one here would tie this file to whichever import path
 * happened to be convenient, and the function's actual contract is "walk it and give it back" —
 * which is true of every shape of event there is.
 */
export function scrubSentryEvent<T>(event: T): T {
  return scrubSecrets(event, literals);
}
