import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientAddress, hashIdentity, identityMatches, resetProcessSaltForTest } from "./hash-identity";

const SALT_ENV = "IP_HASH_SALT";
const original = process.env[SALT_ENV];

beforeEach(() => {
  process.env[SALT_ENV] = "test-salt-one";
  resetProcessSaltForTest();
});

afterEach(() => {
  if (original === undefined) delete process.env[SALT_ENV];
  else process.env[SALT_ENV] = original;
  resetProcessSaltForTest();
});

describe("hashIdentity", () => {
  it("never returns the value it was given", () => {
    // The whole point. Asserted explicitly rather than trusted, because "we hash it" is the kind of
    // claim that survives a refactor in a comment long after it stopped being true in the code.
    for (const address of ["203.0.113.7", "2001:db8::1", "127.0.0.1"]) {
      const hashed = hashIdentity(address)!;
      expect(hashed).not.toContain(address);
      expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("is stable for the same value and different for different ones", () => {
    expect(hashIdentity("203.0.113.7")).toBe(hashIdentity("203.0.113.7"));
    expect(hashIdentity("203.0.113.7")).not.toBe(hashIdentity("203.0.113.8"));
  });

  it("produces a different hash under a different salt", () => {
    // A leaked table from one deployment must not be a lookup table for another, and an unsalted
    // digest of an IPv4 address is enumerable in minutes — the salt is what makes this an
    // anonymisation rather than an inconvenience.
    const withFirst = hashIdentity("203.0.113.7");
    process.env[SALT_ENV] = "test-salt-two";
    resetProcessSaltForTest();
    expect(hashIdentity("203.0.113.7")).not.toBe(withFirst);
  });

  it("returns null for nothing, rather than hashing the empty string", () => {
    // Otherwise "we did not know the address" and "the address was blank" land in the same bucket
    // and share a rate limit.
    expect(hashIdentity(null)).toBeNull();
    expect(hashIdentity(undefined)).toBeNull();
    expect(hashIdentity("")).toBeNull();
    expect(hashIdentity("   ")).toBeNull();
  });

  it("falls back to a per-process salt when none is configured, without throwing", () => {
    delete process.env[SALT_ENV];
    resetProcessSaltForTest();
    const hashed = hashIdentity("203.0.113.7");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    // Stable within the process…
    expect(hashIdentity("203.0.113.7")).toBe(hashed);
    // …and deliberately not across a restart, which is the harmless failure mode.
    resetProcessSaltForTest();
    expect(hashIdentity("203.0.113.7")).not.toBe(hashed);
  });
});

describe("identityMatches", () => {
  it("recognises the same caller and rejects a different one", () => {
    const hash = hashIdentity("203.0.113.7");
    expect(identityMatches(hash, "203.0.113.7")).toBe(true);
    expect(identityMatches(hash, "203.0.113.8")).toBe(false);
  });

  it("is false for anything missing, never throwing on a malformed stored hash", () => {
    expect(identityMatches(null, "203.0.113.7")).toBe(false);
    expect(identityMatches(hashIdentity("203.0.113.7"), null)).toBe(false);
    expect(identityMatches("not-hex", "203.0.113.7")).toBe(false);
    expect(identityMatches("", "203.0.113.7")).toBe(false);
  });
});

describe("clientAddress", () => {
  it("takes the leftmost x-forwarded-for entry, which is the client behind our proxy", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }))).toBe(
      "203.0.113.7"
    );
    expect(clientAddress(new Headers({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to null", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientAddress(new Headers())).toBeNull();
    expect(clientAddress(new Headers({ "x-forwarded-for": "" }))).toBeNull();
  });
});
