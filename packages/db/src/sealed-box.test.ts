import { describe, expect, it } from "vitest";
import {
  SealedBoxError,
  generateMasterKey,
  keyIdOfEnvelope,
  masterKeyFromPublic,
  masterKeyFromSecret,
  masterKeysFrom,
  openProviderKey,
  sealProviderKey,
} from "./sealed-box";

const BINDING = { owner: "user_a", provider: "anthropic" } as const;
const KEY = "sk-ant-api03-Ab3xQ9zLm2Kp7Rv4Nt8Wc1Yd6Fg0Hj5Ul";

function key() {
  return masterKeyFromSecret(generateMasterKey().secret);
}

describe("round trip", () => {
  it.each([
    ["a provider key", KEY],
    ["unicode", "clé-très-privée-🔐-ключ"],
    ["4 KiB", "x".repeat(4096)],
    ["one character", "k"],
  ])("returns %s byte-identical", (_name, plaintext) => {
    const master = key();
    const opened = openProviderKey([master], sealProviderKey(master, plaintext, BINDING), BINDING);
    expect(opened).toBe(plaintext);
  });

  it("derives the same key id from the secret half and from the public half", () => {
    const generated = generateMasterKey();
    expect(masterKeyFromSecret(generated.secret).keyId).toBe(masterKeyFromPublic(generated.publicKey).keyId);
  });

  it("seals with the public half alone — the split deployment's whole point", () => {
    const generated = generateMasterKey();
    const sealing = masterKeyFromPublic(generated.publicKey);
    const opening = masterKeyFromSecret(generated.secret);
    expect(openProviderKey([opening], sealProviderKey(sealing, KEY, BINDING), BINDING)).toBe(KEY);
  });
});

describe("the envelope leaks nothing", () => {
  const master = key();
  const envelope = sealProviderKey(master, KEY, BINDING);

  it("contains no substring of the plaintext longer than a few characters", () => {
    // Every 6-character window of the key. A sealed value that shares one with the plaintext is
    // either not encrypted or is encrypted in a way that preserves structure.
    for (let at = 0; at + 6 <= KEY.length; at += 1) {
      expect(envelope).not.toContain(KEY.slice(at, at + 6));
    }
  });

  it("is versioned and names its master key id", () => {
    expect(envelope.startsWith("41pk1.")).toBe(true);
    expect(keyIdOfEnvelope(envelope)).toBe(master.keyId);
  });

  it("differs every time the same key is sealed, because the ephemeral key is per call", () => {
    const again = sealProviderKey(master, KEY, BINDING);
    expect(again).not.toBe(envelope);
    expect(openProviderKey([master], again, BINDING)).toBe(KEY);
  });

  it("carries the owner and the provider nowhere in the clear", () => {
    expect(envelope).not.toContain(BINDING.owner);
    expect(envelope).not.toContain(BINDING.provider);
  });
});

describe("tampering", () => {
  const master = key();

  /**
   * Flip one bit of a real **byte**, by decoding the part first.
   *
   * ## It used to flip a base64url character, and that failed 6.4% of runs
   *
   * The original helper replaced the part's last character with `A` (or `B` if it was already `A`).
   * **The last base64url character of this part is not a whole byte.** The ciphertext decodes to 62
   * bytes and 62 mod 3 is 2, so the final character carries four significant bits and **two padding
   * bits**, and the decoder discards the padding. `A` is `000000` and `B` is `000001`: they differ
   * only in a padding bit, so when the last character was already `A` the "tampered" envelope
   * decoded to **byte-identical ciphertext**, `openProviderKey` returned the key exactly as it
   * should, and the test failed for doing nothing.
   *
   * Measured rather than reasoned about, on 3,000 seals: **191 undetected flips, 6.4%** — against a
   * predicted 1 in 16, because the ciphertext's length forces the last character to be one of
   * `048AEIMQUYcgkosw` and exactly one of those sixteen is `A`.
   *
   * Two things make this worth the comment rather than a quiet fix. It is a **security** test, and a
   * security test that can silently do nothing is worse than one that is missing, because it reads
   * as coverage. And it broke a CI-parity gate on an unrelated epic, where the cheap move would have
   * been to re-run it and call it flaky — `docs/PROCESS.md`, "'Environmental' is a hypothesis, not
   * a finding". Found by EPIC-050's gate, fixed there, recorded here.
   */
  function flipLastByteOfPart(envelope: string, index: number): string {
    const parts = envelope.split(".");
    const bytes = Buffer.from(parts[index] as string, "base64url");
    bytes[bytes.length - 1] ^= 0x01;
    parts[index] = bytes.toString("base64url");
    return parts.join(".");
  }

  it("refuses a flipped ciphertext byte", () => {
    const tampered = flipLastByteOfPart(sealProviderKey(master, KEY, BINDING), 4);
    expect(() => openProviderKey([master], tampered, BINDING)).toThrow(SealedBoxError);
  });

  /**
   * The control the original lacked: prove the flip actually changes the bytes.
   *
   * Without this, a helper that quietly produced an identical envelope would make the test above
   * assert nothing, which is exactly what was happening. Run over many seals rather than one,
   * because the defect it guards against was probabilistic — a single sample would have passed
   * 15 times out of 16.
   */
  it("the flip is real: it changes the decoded bytes on every seal, not just most", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const envelope = sealProviderKey(master, KEY, BINDING);
      const before = Buffer.from(envelope.split(".")[4] as string, "base64url");
      const after = Buffer.from(flipLastByteOfPart(envelope, 4).split(".")[4] as string, "base64url");
      expect(after.equals(before)).toBe(false);
    }
  });

  it("refuses a swapped ephemeral public key", () => {
    const mine = sealProviderKey(master, KEY, BINDING);
    const other = sealProviderKey(master, "sk-ant-api03-different", BINDING);
    const parts = mine.split(".");
    parts[2] = other.split(".")[2] as string;
    expect(() => openProviderKey([master], parts.join("."), BINDING)).toThrow(SealedBoxError);
  });

  it("refuses a truncated tag", () => {
    const parts = sealProviderKey(master, KEY, BINDING).split(".");
    const body = Buffer.from(parts[4] as string, "base64url");
    parts[4] = body.subarray(0, body.length - 4).toString("base64url");
    expect(() => openProviderKey([master], parts.join("."), BINDING)).toThrow(SealedBoxError);
  });

  it("refuses something that is not an envelope at all", () => {
    expect(() => openProviderKey([master], "not-an-envelope", BINDING)).toThrow(/not a sealed provider key/);
    expect(() => keyIdOfEnvelope("41pk9.a.b.c.d")).toThrow(/not a sealed provider key/);
  });
});

describe("an envelope is bound to its row", () => {
  const master = key();
  const envelope = sealProviderKey(master, KEY, BINDING);

  it("will not open as another person's row", () => {
    expect(() => openProviderKey([master], envelope, { owner: "user_b", provider: "anthropic" })).toThrow(
      /different person or provider/,
    );
  });

  it("will not open as another provider's row", () => {
    expect(() => openProviderKey([master], envelope, { owner: "user_a", provider: "openai" })).toThrow(
      /different person or provider/,
    );
  });
});

describe("rotation", () => {
  it("opens under the old key while sealing under the new one", () => {
    const old = key();
    const fresh = key();
    const sealedThen = sealProviderKey(old, KEY, BINDING);
    const sealedNow = sealProviderKey(fresh, KEY, BINDING);
    const held = [fresh, old];

    expect(openProviderKey(held, sealedThen, BINDING)).toBe(KEY);
    expect(openProviderKey(held, sealedNow, BINDING)).toBe(KEY);
    expect(keyIdOfEnvelope(sealedThen)).not.toBe(keyIdOfEnvelope(sealedNow));
  });

  it("names the missing key rather than reporting a decryption failure", () => {
    const orphaned = sealProviderKey(key(), KEY, BINDING);
    expect(() => openProviderKey([key()], orphaned, BINDING)).toThrow(/no master key with id/);
  });

  it("says so when it holds only the public half and is asked to open", () => {
    const generated = generateMasterKey();
    const sealing = masterKeyFromPublic(generated.publicKey);
    const envelope = sealProviderKey(sealing, KEY, BINDING);
    expect(() => openProviderKey([sealing], envelope, BINDING)).toThrow(/seal but not open/);
  });
});

describe("reading the environment", () => {
  it("finds nothing when nothing is configured", () => {
    expect(masterKeysFrom({})).toEqual([]);
  });

  it("takes several comma-separated secrets, newest first", () => {
    const a = generateMasterKey();
    const b = generateMasterKey();
    const keys = masterKeysFrom({ KEY_ENCRYPTION_SECRET: ` ${a.secret} , ${b.secret} ` });
    expect(keys.map((each) => each.keyId)).toEqual([a.keyId, b.keyId]);
    expect(keys.every((each) => each.secretKey !== undefined)).toBe(true);
  });

  it("falls back to the public half only when there is no secret", () => {
    const generated = generateMasterKey();
    const [only] = masterKeysFrom({ KEY_ENCRYPTION_PUBLIC_KEY: generated.publicKey });
    expect(only?.keyId).toBe(generated.keyId);
    expect(only?.secretKey).toBeUndefined();
  });

  it("prefers the secret when both are set, so a process that can open is never seeded to only seal", () => {
    const generated = generateMasterKey();
    const other = generateMasterKey();
    const [only] = masterKeysFrom({
      KEY_ENCRYPTION_SECRET: generated.secret,
      KEY_ENCRYPTION_PUBLIC_KEY: other.publicKey,
    });
    expect(only?.keyId).toBe(generated.keyId);
    expect(only?.secretKey).toBeDefined();
  });

  it("refuses a malformed secret in words", () => {
    expect(() => masterKeyFromSecret("too-short")).toThrow(/X25519 key is 32/);
    expect(() => masterKeyFromPublic(Buffer.alloc(31).toString("base64url"))).toThrow(/X25519 key is 32/);
  });

  it("refuses to seal nothing", () => {
    expect(() => sealProviderKey(key(), "", BINDING)).toThrow(/nothing to seal/);
  });
});
