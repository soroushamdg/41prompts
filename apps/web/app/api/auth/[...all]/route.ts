import { createLogger, withRequestId } from "@41prompts/logger";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth";

const logger = createLogger("web");

// The one real per-request choke point that exists in this app today (EPIC-004's "log output ...
// carries a request id"): every Better Auth call — OAuth redirects and callbacks, magic-link
// send and verify, session checks — passes through this handler. `withRequestId` wraps the whole
// call so anything downstream (this epic's signup/login analytics in lib/auth.ts included) can
// pick up the same id via `packages/logger`'s ambient context, with nothing threaded through
// Better Auth's own hook signatures. No email, no request body, ever (decision 3) — method, path
// and status only.
async function handler(request: Request): Promise<Response> {
  return withRequestId(async (requestId) => {
    const start = Date.now();
    const response = await getAuth().handler(request);
    logger.info(
      {
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Date.now() - start,
      },
      "auth request",
    );
    return response;
  });
}

export const { GET, POST } = toNextJsHandler(handler);
