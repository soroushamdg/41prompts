import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { keyAad, open, seal } from "./crypto";

beforeAll(() => {
  process.env.KEYS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("key encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const s = seal("sk-proj-secret-value-123", keyAad("u1", "openai"));
    expect(JSON.stringify(s)).not.toContain("secret");
    expect(open(s, keyAad("u1", "openai"))).toBe("sk-proj-secret-value-123");
  });

  it("uses a fresh IV every time", () => {
    const a = seal("same", "x");
    const b = seal("same", "x");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a ciphertext moved to another user or provider, or tampered with", () => {
    const s = seal("sk-ant-secret", keyAad("u1", "anthropic"));
    expect(() => open(s, keyAad("u2", "anthropic"))).toThrow();
    expect(() => open(s, keyAad("u1", "openai"))).toThrow();
    const bad = { ...s, ciphertext: Buffer.from("tampered!").toString("base64") };
    expect(() => open(bad, keyAad("u1", "anthropic"))).toThrow();
  });
});
