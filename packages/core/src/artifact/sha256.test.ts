// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { sha256, sha256Text, utf8Bytes } from "./sha256.js";

/**
 * **These vectors are the test, and they were not chosen by this implementation.**
 *
 * Hand-written cryptographic code is the kind nobody should trust on the strength of it looking
 * right, and a round-trip test — hash it twice, get the same answer — passes just as happily on a
 * digest that is wrong in the same way every time. The published FIPS 180-4 / NIST CAVP values below
 * cannot be satisfied by an implementation that transposed a constant, rotated by the wrong amount,
 * or hashed UTF-16 code units instead of UTF-8 bytes.
 *
 * The four in `NIST` are the ones the standard itself works through: the empty message, `"abc"`
 * (one block), the 448-bit message (padding that just fits), and the 896-bit message (two blocks).
 */
const NIST: readonly (readonly [string, string])[] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1",
  ],
];

describe("sha256", () => {
  it.each(NIST)("matches the published NIST vector for %j", (input, expected) => {
    expect(sha256Text(input)).toBe(expected);
  });

  /**
   * The standard's fifth vector: one million `a`s, 15,625 blocks. Slow enough to be worth naming and
   * fast enough to keep — it is the only case here that exercises the block loop more than twice,
   * and a length field written with `>>>` instead of a division fails at exactly this size class.
   */
  it("matches the million-character vector, which is the only multi-block-loop case", () => {
    expect(sha256Text("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("is 64 lower-case hex characters, always", () => {
    for (const input of ["", "a", "abc", "🙂", "x".repeat(1000)]) {
      expect(sha256Text(input)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("changes on a one-bit difference", () => {
    expect(sha256Text("abc")).not.toBe(sha256Text("abd"));
  });

  /**
   * Every message length from 0 to 130 bytes crosses both padding boundaries — the block that just
   * fits its length field (55) and the one that does not (56) — and the second block boundary at
   * 119/120. A padding error lives in exactly one of these and in none of the vectors above.
   */
  it("produces a distinct digest at every length across both padding boundaries", () => {
    const digests = new Set<string>();
    for (let length = 0; length <= 130; length++) digests.add(sha256Text("a".repeat(length)));
    expect(digests.size).toBe(131);
  });
});

describe("utf8Bytes", () => {
  it("encodes ASCII as one byte each", () => {
    expect([...utf8Bytes("abc")]).toEqual([0x61, 0x62, 0x63]);
  });

  it("encodes a two-byte code point", () => {
    expect([...utf8Bytes("é")]).toEqual([0xc3, 0xa9]);
  });

  it("encodes a three-byte code point", () => {
    expect([...utf8Bytes("€")]).toEqual([0xe2, 0x82, 0xac]);
  });

  /**
   * The case that separates a correct encoder from one that walks code units: an emoji is a
   * surrogate pair in a JavaScript string and four bytes in UTF-8, not two three-byte sequences.
   */
  it("encodes an astral code point as the four bytes it is, not as two surrogates", () => {
    expect([...utf8Bytes("🙂")]).toEqual([0xf0, 0x9f, 0x99, 0x82]);
  });

  it("substitutes U+FFFD for a lone surrogate, as TextEncoder does", () => {
    expect([...utf8Bytes("\ud800")]).toEqual([0xef, 0xbf, 0xbd]);
  });

  /**
   * The digest is over bytes, so a non-ASCII string must hash as its UTF-8 encoding. Asserted
   * against a value computed from the byte array rather than from the string, so the two paths have
   * to agree.
   */
  it("hashes text as its UTF-8 bytes", () => {
    expect(sha256Text("é")).toBe(sha256(Uint8Array.from([0xc3, 0xa9])));
  });
});
