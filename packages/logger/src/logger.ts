import type { Writable } from "node:stream";
import pino, { type Logger } from "pino";

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

// `destination` is only ever passed in tests, to assert on JSON output without touching real
// stdout — production and dev callers always get pino's default (fd 1).
export function createLogger(name: string, destination?: Writable): Logger {
  const options = {
    name,
    level: process.env.LOG_LEVEL ?? "info",
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime
  };
  return destination ? pino(options, destination) : pino(options);
}
