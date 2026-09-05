import { afterEach, describe, expect, it, vi } from "vitest";

const bossInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  createQueue: ReturnType<typeof vi.fn>;
  schedule: ReturnType<typeof vi.fn>;
  work: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("pg-boss", () => {
  class FakePgBoss {
    start = vi.fn().mockResolvedValue(undefined);
    createQueue = vi.fn().mockResolvedValue(undefined);
    schedule = vi.fn().mockResolvedValue(undefined);
    work = vi.fn().mockResolvedValue(undefined);
    on = vi.fn();

    constructor() {
      bossInstances.push(this);
    }
  }
  return { PgBoss: FakePgBoss };
});

vi.mock("./db", () => ({ db: {} }));

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@41prompts/logger", () => ({
  createLogger: () => logger,
  withRequestId: async (fn: (id: string) => unknown) => fn("test-request-id"),
}));

vi.mock("./sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { captureException: vi.fn() },
}));

const { main } = await import("./main");

describe("worker main", () => {
  afterEach(() => {
    process.removeAllListeners("SIGTERM");
    process.removeAllListeners("SIGINT");
    vi.useRealTimers();
    vi.clearAllMocks();
    bossInstances.length = 0;
  });

  it('logs "worker up"', async () => {
    await main();
    expect(logger.info).toHaveBeenCalledWith("worker up");
  });

  it("starts pg-boss and registers the daily purge job", async () => {
    await main();

    expect(bossInstances).toHaveLength(1);
    const boss = bossInstances[0]!;
    expect(boss.start).toHaveBeenCalled();
    expect(boss.createQueue).toHaveBeenCalledWith("purge-deleted-users");
    expect(boss.schedule).toHaveBeenCalledWith("purge-deleted-users", "0 3 * * *");
    expect(boss.work).toHaveBeenCalledWith("purge-deleted-users", expect.any(Function));
  });

  it("logs a heartbeat every 60 seconds and stays alive", async () => {
    vi.useFakeTimers();
    await main();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("worker heartbeat"));

    logger.info.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it.each(["SIGTERM", "SIGINT"] as const)("exits cleanly on %s and stops the heartbeat", async (signal) => {
    vi.useFakeTimers();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    await main();

    process.emit(signal);

    expect(logger.info).toHaveBeenCalledWith(`worker received ${signal}, shutting down`);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(exitSpy).toHaveBeenCalledTimes(1);

    logger.info.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
