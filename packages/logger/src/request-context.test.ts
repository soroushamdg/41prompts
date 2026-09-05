import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { currentRequestId, loggerWithRequestId, withRequestId } from "./request-context";

class CollectingStream extends Writable {
  lines: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    this.lines.push(chunk.toString());
    callback();
  }
}

describe("withRequestId / currentRequestId", () => {
  it("is undefined outside any request context", () => {
    expect(currentRequestId()).toBeUndefined();
  });

  it("exposes the generated id inside the callback", () => {
    withRequestId((id) => {
      expect(currentRequestId()).toBe(id);
    });
  });

  it("accepts an explicit id instead of generating one", () => {
    withRequestId(() => {
      expect(currentRequestId()).toBe("fixed-id");
    }, "fixed-id");
  });

  it("survives an await inside the callback", async () => {
    const seen = await withRequestId(async (id) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return currentRequestId() === id;
    });
    expect(seen).toBe(true);
  });

  it("does not leak a request id into an unrelated call", () => {
    withRequestId(() => {
      // still inside the first context
    }, "first");
    expect(currentRequestId()).toBeUndefined();
  });
});

describe("loggerWithRequestId", () => {
  it("attaches the current request id to log lines", () => {
    const stream = new CollectingStream();
    const base = createLogger("test", stream);

    withRequestId((id) => {
      loggerWithRequestId(base).info("inside a request");
      const entry = JSON.parse(stream.lines[0]!) as { requestId: string };
      expect(entry.requestId).toBe(id);
    });
  });

  it("omits requestId entirely outside a request context", () => {
    const stream = new CollectingStream();
    const base = createLogger("test", stream);

    loggerWithRequestId(base).info("no request");

    const entry = JSON.parse(stream.lines[0]!) as Record<string, unknown>;
    expect(entry.requestId).toBeUndefined();
  });
});
