import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureEvent = vi.fn();
const headerStore = new Map<string, string>();
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (k: string) => (cookieStore.has(k) ? { value: cookieStore.get(k) } : undefined) })
}));
vi.mock("./posthog-server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./posthog-server")>();
  return { ...actual, captureEvent };
});

const { captureVisitorEvent } = await import("./visitor");

const originalEnv = { deploy: process.env.DEPLOY_ENV, salt: process.env.IP_HASH_SALT };

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  captureEvent.mockClear();
  process.env.DEPLOY_ENV = "production";
  process.env.IP_HASH_SALT = "test-salt-for-visitor";
  headerStore.set("x-forwarded-for", "203.0.113.7");
});

/** Most tests below are about *what* is sent, not *whether*; consent is the subject of its own block. */
function withConsent(): void {
  cookieStore.set("41prompts_analytics_consent", "granted");
}

afterEach(() => {
  if (originalEnv.deploy === undefined) delete process.env.DEPLOY_ENV;
  else process.env.DEPLOY_ENV = originalEnv.deploy;
  if (originalEnv.salt === undefined) delete process.env.IP_HASH_SALT;
  else process.env.IP_HASH_SALT = originalEnv.salt;
});

describe("counting an anonymous visitor", () => {
  it("sends nothing to PostHog in production without explicit consent", async () => {
    // The M1 count no longer runs through here — it is written to our own Postgres — so PostHog
    // being silent for most visitors costs the measurement nothing.
    await captureVisitorEvent("decompile_run", { bloks: 6 });
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("sends one once the visitor has explicitly said yes", async () => {
    cookieStore.set("41prompts_analytics_consent", "granted");
    await captureVisitorEvent("decompile_run", { bloks: 6 });
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent.mock.calls[0]?.[1]).toBe("decompile_run");
    expect(captureEvent.mock.calls[0]?.[2]).toEqual({ bloks: 6 });
  });

  it("never sends the address, only a hash of it", async () => {
    withConsent();
    // The whole privacy claim of this measurement, asserted rather than trusted. EPIC-014 refuses to
    // store an address; this refuses to send one to a third party.
    await captureVisitorEvent("decompile_view");
    const distinctId = String(captureEvent.mock.calls[0]?.[0]);
    expect(distinctId).not.toContain("203.0.113.7");
    expect(distinctId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same caller the same id, so 'unique' means something", async () => {
    withConsent();
    await captureVisitorEvent("decompile_view");
    await captureVisitorEvent("decompile_run");
    const [first, second] = captureEvent.mock.calls.map((c) => c[0]);
    expect(first).toBe(second);

    headerStore.set("x-forwarded-for", "203.0.113.8");
    await captureVisitorEvent("decompile_view");
    expect(captureEvent.mock.calls[2]?.[0]).not.toBe(first);
  });

  it("counts a caller with no address under one shared bucket rather than dropping them", async () => {
    withConsent();
    // Dropping a slice of traffic would bias the funnel's ratios, which matter more than its floor.
    headerStore.clear();
    await captureVisitorEvent("decompile_view");
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent.mock.calls[0]?.[0]).toBe("anonymous-no-address");
  });
});

describe("a visitor who declines is not counted", () => {
  it.each([
    ["Do Not Track", () => headerStore.set("dnt", "1")],
    ["Global Privacy Control", () => headerStore.set("sec-gpc", "1")],
    ["a declined consent cookie", () => cookieStore.set("41prompts_analytics_consent", "denied")]
  ])("sends nothing at all when the visitor signals %s", async (_name, signal) => {
    withConsent();
    signal();
    await captureVisitorEvent("decompile_run");
    // Not "sends an anonymised event" — sends nothing. There is no reduced form of being counted.
    expect(captureEvent).not.toHaveBeenCalled();
  });

  it("still sends one whose cookie says granted", async () => {
    withConsent();
    await captureVisitorEvent("decompile_share");
    expect(captureEvent).toHaveBeenCalledTimes(1);
  });

  it("is not fooled by a DNT header that says tracking is fine", async () => {
    withConsent();
    headerStore.set("dnt", "0");
    await captureVisitorEvent("decompile_view");
    expect(captureEvent).toHaveBeenCalledTimes(1);
  });
});
