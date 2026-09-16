/**
 * Value-shaped redaction: find a credential by what it **looks like**, not by what it is called.
 *
 * ## Why a path list was not enough (EPIC-043)
 *
 * `logger.ts` redacts by path — `email`, `token`, `password`, `req.headers.cookie`. That list works
 * exactly when the call site puts the secret in a field somebody already thought of. A provider key
 * does not arrive that way. It arrives inside an error message from an SDK that echoed the request,
 * inside a job payload nobody named, inside a stack frame, three levels down in an object a
 * `catch` block logged whole. Every one of those is a path the list does not have, and adding three
 * more names would leave the fourth.
 *
 * So this matches the value. A string that looks like an Anthropic, OpenAI or Google key, or like
 * one of this deployment's own configured secrets, is replaced wherever it is found.
 *
 * ## This file has no imports, and that is load-bearing
 *
 * It runs in three places with three different module systems: pino in Node, Sentry on the server,
 * and **Sentry in the browser**, where dragging pino in through a barrel export would put a logging
 * library in the bundle a person downloads. Zero imports means `@41prompts/logger/src/scrub` can be
 * deep-imported by a client component without carrying anything else with it.
 *
 * ## It is on a hot path
 *
 * Every log line in both processes goes through it. Hence: one combined expression rather than five
 * sequential ones, an early exit on anything that is not a string or a container, and a depth cap so
 * a cyclic or enormous object cannot turn a log call into a walk of the heap.
 */

/** What a redacted value becomes. Matches `logger.ts`'s existing censor, deliberately. */
export const REDACTED = "[redacted]";

/**
 * The shapes, as one expression so a string is scanned once.
 *
 * - `sk-ant-…`  Anthropic. Listed before the generic `sk-` so the longer match wins.
 * - `sk-…`      OpenAI, which also covers `sk-proj-`.
 * - `AIza…`     Google AI Studio and Google Cloud API keys.
 * - `41p_…`     Our own api keys (`packages/db/src/api-keys.ts`), which a customer's integration
 *               sends us on every request and which would otherwise be logged by anything that logs
 *               an authorization header we did not name.
 *
 * The minimum lengths are what keeps this from redacting prose. "sk-" on its own, a hex id, or the
 * word "AIza" in a sentence do not match; sixteen key characters after the prefix do.
 */
const SECRET_SHAPES = /sk-ant-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{30,}|41p_[A-Za-z0-9_-]{16,}/g;

/**
 * A password inside a connection URL.
 *
 * `DATABASE_URL` is in every environment and is logged by things that log their own configuration.
 * Redacting the whole URL would take the host and database name with it, which is most of what
 * makes such a line worth having, so only the password between `:` and `@` goes.
 */
const URL_PASSWORD = /\/\/([^/:@\s]+):([^/@\s]+)@/g;

/** A literal, escaped for use inside a regular expression. */
function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a matcher for literal secrets this deployment actually holds.
 *
 * **This is the half that catches a secret with no recognisable shape** — the provider-key master
 * key is 43 base64url characters and looks like nothing in particular, so no pattern could find it.
 * Passing its value in means it is redacted anyway.
 *
 * Short values are dropped: a one- or two-character "secret" would redact ordinary text everywhere
 * it occurred, which is a denial of service against your own logs.
 */
export function literalSecretMatcher(secrets: readonly string[]): RegExp | undefined {
  const usable = [...new Set(secrets.filter((secret) => typeof secret === "string" && secret.length >= 8))];
  if (usable.length === 0) return undefined;
  // Longest first, so a secret that contains another is redacted whole rather than in pieces.
  usable.sort((a, b) => b.length - a.length);
  return new RegExp(usable.map(escapeLiteral).join("|"), "g");
}

/**
 * The secrets a process holds, read out of its environment by name.
 *
 * Named rather than "every variable whose name contains SECRET", because a heuristic over names is
 * the same mistake as a heuristic over field paths one level up — and because redacting the value of
 * something harmless (`DEPLOY_ENV=production`) would blank the word "production" out of every log
 * line in the system.
 */
export const SECRET_ENV_NAMES = [
  "KEY_ENCRYPTION_SECRET",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "FORTYONE_API_KEY",
  "BETTER_AUTH_SECRET",
  "R2_SECRET_ACCESS_KEY",
  "R2_ACCESS_KEY_ID",
  "POSTGRES_PASSWORD",
  "RESEND_API_KEY",
  "IP_HASH_SECRET",
] as const;

export function secretsFromEnv(env: Record<string, string | undefined> = process.env): readonly string[] {
  const found: string[] = [];
  for (const name of SECRET_ENV_NAMES) {
    const value = env[name];
    if (typeof value !== "string") continue;
    // `KEY_ENCRYPTION_SECRET` may carry several comma-separated keys during a rotation; each of
    // them is a secret in its own right and each has to be redacted separately.
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length >= 8) found.push(trimmed);
    }
  }
  return found;
}

/** Redact every secret in one string. */
export function scrubString(value: string, literals?: RegExp): string {
  let out = value;
  if (literals) {
    literals.lastIndex = 0;
    out = out.replace(literals, REDACTED);
  }
  SECRET_SHAPES.lastIndex = 0;
  out = out.replace(SECRET_SHAPES, REDACTED);
  URL_PASSWORD.lastIndex = 0;
  out = out.replace(URL_PASSWORD, `//$1:${REDACTED}@`);
  return out;
}

const MAX_DEPTH = 8;

/**
 * Redact every secret anywhere in a value.
 *
 * Strings, arrays, plain objects, `Error`s (message and stack) and `Map`/`Set` contents are walked.
 * Everything else is returned as it came: a `Date`, a `Buffer`, a class instance with behaviour are
 * not places a key hides, and copying them would change what a caller logged.
 *
 * Returns a new value rather than mutating, because the object being logged is usually still in use
 * by the code that logged it, and a redaction that edited it would change the program's behaviour to
 * make a log line safe.
 */
export function scrubSecrets<T>(value: T, literals?: RegExp, depth = 0): T {
  if (typeof value === "string") {
    return scrubString(value, literals) as unknown as T;
  }
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((each) => scrubSecrets(each, literals, depth + 1)) as unknown as T;
  }
  if (value instanceof Error) {
    // A new Error would lose the original's own class and any fields on it, so this copies the
    // instance shallowly and rewrites only the two strings that carry text.
    const copy: Record<string, unknown> = Object.create(Object.getPrototypeOf(value) as object);
    Object.assign(copy, value);
    copy.message = scrubString(value.message, literals);
    if (typeof value.stack === "string") copy.stack = scrubString(value.stack, literals);
    if (value.cause !== undefined) copy.cause = scrubSecrets(value.cause, literals, depth + 1);
    return copy as unknown as T;
  }
  if (value instanceof Date || value instanceof RegExp || ArrayBuffer.isView(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, each] of Object.entries(value as Record<string, unknown>)) {
    out[key] = scrubSecrets(each, literals, depth + 1);
  }
  return out as unknown as T;
}
