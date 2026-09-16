import type { Writable } from "node:stream";
import pino, { type Logger } from "pino";
import { literalSecretMatcher, scrubSecrets, secretsFromEnv } from "./scrub";

// Decision 3 (EPIC-004): no PII anywhere in logs, ever. This redaction list is the safety net —
// call sites should never pass these fields in the first place, but a mistake here must not leak
// an email, a credential, or a provider payload into stdout. `*.field` covers nested objects
// (pino-http style `req`/`res` wrappers, job payloads) without needing to know their exact shape.
const REDACT_PATHS = [
  "email",
  "*.email",
  "password",
  "*.password",
  "token",
  "*.token",
  "req.headers.cookie",
  "req.headers.authorization",
  "*.headers.cookie",
  "*.headers.authorization",
  "prompt",
  "*.prompt",
  "payload",
  "*.payload"
];

/**
 * EPIC-043: the same list, one level up — by **value** rather than by path.
 *
 * `REDACT_PATHS` above catches a secret that arrives in a field somebody named. A provider key does
 * not: it arrives inside an SDK's error message, inside a job payload, three levels into an object a
 * `catch` block logged whole. `scrub.ts` has the whole argument. Two hooks, because pino keeps the
 * message and the merged object apart and a secret can be in either:
 *
 * - `formatters.log` sees the merged object, after path redaction has already run.
 * - `hooks.logMethod` sees the arguments as written, which is where `msg` still is.
 *
 * `env` is a parameter so a test can prove the literal-secret path without setting a real one in the
 * process; production and dev callers pass nothing and get `process.env`.
 */
export interface LoggerOptions {
  readonly destination?: Writable | undefined;
  readonly env?: Record<string, string | undefined> | undefined;
}

// `destination` is only ever passed in tests, to assert on JSON output without touching real
// stdout — production and dev callers always get pino's default (fd 1).
export function createLogger(name: string, destination?: Writable, options: LoggerOptions = {}): Logger {
  const literals = literalSecretMatcher(secretsFromEnv(options.env ?? process.env));
  const pinoOptions = {
    name,
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object: Record<string, unknown>): Record<string, unknown> {
        return scrubSecrets(object, literals);
      }
    },
    hooks: {
      logMethod(this: Logger, args: unknown[], method: (...passed: unknown[]) => void): void {
        method.apply(this, args.map((each) => scrubSecrets(each, literals)));
      }
    }
  };
  return destination ? pino(pinoOptions, destination) : pino(pinoOptions);
}
