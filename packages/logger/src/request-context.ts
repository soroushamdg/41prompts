import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";

const storage = new AsyncLocalStorage<{ requestId: string }>();

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

// Runs `fn` with a request/job id bound for the lifetime of the call (including across `await`s
// inside it) so any log line written anywhere underneath — without threading a logger or id
// through every function signature — can attach it. Web calls this once per HTTP request; the
// worker calls it once per job run (a "request" in the sense this epic means it: one attributable
// unit of work).
export function withRequestId<T>(fn: (requestId: string) => T, requestId: string = randomUUID()): T {
  return storage.run({ requestId }, () => fn(requestId));
}

export function loggerWithRequestId(base: Logger): Logger {
  const requestId = currentRequestId();
  return requestId ? base.child({ requestId }) : base;
}
