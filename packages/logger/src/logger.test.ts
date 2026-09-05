import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

class CollectingStream extends Writable {
  lines: string[] = [];

  override _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void): void {
    this.lines.push(chunk.toString());
    callback();
  }
}

function parseLines(stream: CollectingStream): unknown[] {
  return stream.lines.filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
}

describe("createLogger", () => {
  it("writes JSON lines", () => {
    const stream = new CollectingStream();
    const logger = createLogger("test", stream);

    logger.info("hello");

    const [entry] = parseLines(stream) as { msg: string; name: string }[];
    expect(entry.msg).toBe("hello");
    expect(entry.name).toBe("test");
  });

  it("redacts an email field instead of logging it", () => {
    const stream = new CollectingStream();
    const logger = createLogger("test", stream);

    logger.info({ email: "user@example.com" }, "signed in");

    const raw = stream.lines.join("\n");
    expect(raw).not.toContain("user@example.com");
    const [entry] = parseLines(stream) as { email: string }[];
    expect(entry.email).toBe("[redacted]");
  });

  it("redacts a nested email field", () => {
    const stream = new CollectingStream();
    const logger = createLogger("test", stream);

    logger.info({ user: { email: "nested@example.com" } }, "event");

    expect(stream.lines.join("\n")).not.toContain("nested@example.com");
  });

  it("redacts a provider payload field", () => {
    const stream = new CollectingStream();
    const logger = createLogger("test", stream);

    logger.info({ payload: { secret: "raw provider response" } }, "run completed");

    expect(stream.lines.join("\n")).not.toContain("raw provider response");
  });
});
