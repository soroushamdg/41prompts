import { afterEach, describe, expect, it } from "vitest";
import type { EventName } from "./events";
import { captureEvent, hasAnalyticsConsent } from "./posthog-server";

describe("captureEvent", () => {
  it("throws at runtime for a name outside the closed set, even past a TypeScript cast", () => {
    expect(() => captureEvent("user_1", "not_a_real_event" as EventName)).toThrow(
      /not one of the allowed event names/,
    );
  });

  it("is a no-op (does not throw) for a real event name when no PostHog key is configured", () => {
    expect(() => captureEvent("user_1", "signup")).not.toThrow();
  });
});

describe("hasAnalyticsConsent", () => {
  const originalDeployEnv = process.env.DEPLOY_ENV;

  afterEach(() => {
    if (originalDeployEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = originalDeployEnv;
  });

  it("allows a signed-in visitor in production with no consent cookie", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ isSignedIn: true })).toBe(true);
  });

  it("blocks an anonymous visitor in production with no consent cookie", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ isSignedIn: false })).toBe(false);
  });

  it("allows an anonymous visitor in production once consent is granted", () => {
    process.env.DEPLOY_ENV = "production";
    expect(hasAnalyticsConsent({ isSignedIn: false, consentCookie: "granted" })).toBe(true);
  });

  it("allows an anonymous visitor outside production regardless of consent", () => {
    process.env.DEPLOY_ENV = "staging";
    expect(hasAnalyticsConsent({ isSignedIn: false })).toBe(true);
  });

  it("defaults to allowed when DEPLOY_ENV is unset (local dev)", () => {
    delete process.env.DEPLOY_ENV;
    expect(hasAnalyticsConsent({ isSignedIn: false })).toBe(true);
  });
});
