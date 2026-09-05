import { describe, expect, it } from "vitest";
import { hashApiKey, lastFourOf, verifyApiKey } from "./api-keys";

describe("api key hashing", () => {
  it("hashes deterministically", () => {
    expect(hashApiKey("secret-key-value")).toBe(hashApiKey("secret-key-value"));
  });

  it("produces different hashes for different keys", () => {
    expect(hashApiKey("secret-key-value-a")).not.toBe(hashApiKey("secret-key-value-b"));
  });

  it("never contains the plaintext key material", () => {
    const plaintext = "secret-key-value";
    expect(hashApiKey(plaintext)).not.toContain(plaintext);
  });

  it("verifies a key against its own hash", () => {
    const plaintext = "secret-key-value";
    expect(verifyApiKey(plaintext, hashApiKey(plaintext))).toBe(true);
  });

  it("rejects a key that doesn't match the stored hash", () => {
    expect(verifyApiKey("wrong-key", hashApiKey("secret-key-value"))).toBe(false);
  });

  it("extracts the last four characters", () => {
    expect(lastFourOf("41p_abcd1234")).toBe("1234");
  });
});
