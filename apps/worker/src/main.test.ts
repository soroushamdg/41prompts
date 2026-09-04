import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "./main.js";

describe("worker main", () => {
  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('logs "worker up"', () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    main();
    expect(spy).toHaveBeenCalledWith("worker up");
  });

  it("logs a heartbeat every 60 seconds and stays alive", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    main();

    vi.advanceTimersByTime(60_000);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("worker heartbeat"));

    spy.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it.each(["SIGTERM", "SIGINT"] as const)(
    "exits cleanly on %s and stops the heartbeat",
    (signal) => {
      vi.useFakeTimers();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
      main();

      process.emit(signal);

      expect(logSpy).toHaveBeenCalledWith(`worker received ${signal}, shutting down`);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(exitSpy).toHaveBeenCalledTimes(1);

      logSpy.mockClear();
      vi.advanceTimersByTime(120_000);
      expect(logSpy).not.toHaveBeenCalled();
    }
  );
});
