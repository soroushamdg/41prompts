import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { connectionAad, open, seal } from "./crypto";

beforeAll(() => {
  process.env.KEYS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("key encryption", () => {
  it("round-trips and never stores the plaintext", () => {
    const aad = connectionAad("u1", "c1", "openai");
    const s = seal("sk-proj-secret-value-123", aad);
    expect(JSON.stringify(s)).not.toContain("secret");
    expect(open(s, aad)).toBe("sk-proj-secret-value-123");
  });

  it("uses a fresh IV every time", () => {
    const a = seal("same", "x");
    const b = seal("same", "x");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a ciphertext moved to another user, model or destination, or tampered with", () => {
    const s = seal("sk-ant-secret", connectionAad("u1", "c1", "custom|https://llm.example.com"));
    expect(() => open(s, connectionAad("u2", "c1", "custom|https://llm.example.com"))).toThrow();
    expect(() => open(s, connectionAad("u1", "c2", "custom|https://llm.example.com"))).toThrow();
    expect(() => open(s, connectionAad("u1", "c1", "custom|https://evil.example"))).toThrow();
    const bad = { ...s, ciphertext: Buffer.from("tampered!").toString("base64") };
    expect(() => open(bad, connectionAad("u1", "c1", "custom|https://llm.example.com"))).toThrow();
  });

  it("cannot be confused by separators inside the parts", () => {
    expect(connectionAad("a|b", "c", "d")).not.toBe(connectionAad("a", "b|c", "d"));
  });
});
