// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * SHA-256 (FIPS 180-4), written out, because `packages/core` has nowhere to get one.
 *
 * ## Why this exists at all, when `hash()` is right there
 *
 * `compile/hash.ts`'s `hash()` is 64-bit FNV-1a and its own comment says what it is: *"Not a
 * cryptographic hash and not used as one — it addresses content, it does not authenticate it."*
 * That is the correct tool for a span cache, where a collision costs a wrong cached string in a
 * process that owns both sides.
 *
 * The build artifact is the other case. It is written to R2 with immutable headers, fetched over a
 * network by `@41prompts/sdk` in somebody else's production process, and **verified against a hash
 * the Live marker gave it** (EPIC-052). A 64-bit non-cryptographic digest cannot carry that
 * sentence: it is collidable on a laptop, so "the bytes I fetched hash to the value the marker
 * named" would stop meaning "these are the bytes that were published". `docs/roadmap.md`'s own task
 * line for EPIC-050 says *content-addressed sha*, and this is that.
 *
 * ## Why it is written out rather than imported
 *
 * `CLAUDE.md`: `packages/core` is *pure TS, **zero dependencies, no DOM, no IO***. That rules out a
 * package, and it rules out `node:crypto` — not on a technicality, but because this package is
 * published to npm and PyPI's sibling is ported from it, and it runs in a browser inside
 * `apps/web`'s decompiler today. `version/diff.ts` already made this exact call for UTF-8 byte
 * counting and its comment is the precedent.
 *
 * The cost is that this is hand-written cryptographic code, which is the kind nobody should trust on
 * the strength of it looking right. It is therefore proved against the **published FIPS 180-4
 * vectors** rather than against itself: `sha256.test.ts` has the empty string, `"abc"`, the two
 * multi-block NIST messages and a million-character input, none of which this implementation had any
 * hand in choosing. A transcription error cannot survive them.
 *
 * ## What it is not
 *
 * Not a MAC, not a signature, and not an answer to *who* published an artifact. It answers "are
 * these the bytes that were named", and nothing else. Artifact integrity against an attacker who can
 * move the marker is EPIC-057's threat model, and it is deliberately not pre-empted here.
 */

/** The first thirty-two bits of the fractional parts of the cube roots of the first 64 primes. */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

/** The first thirty-two bits of the fractional parts of the square roots of the first 8 primes. */
const H0 = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

/** Rotate right, on the low 32 bits. `>>> 0` keeps every intermediate unsigned. */
const rotr = (value: number, bits: number): number => ((value >>> bits) | (value << (32 - bits))) >>> 0;

/**
 * A string's UTF-8 bytes.
 *
 * Hand-encoded rather than `TextEncoder` or `Buffer`, for the reason `version/diff.ts` gives for
 * hand-counting them: zero dependencies, no DOM, and no assumption about which globals exist in
 * whatever runtime this package is installed into.
 *
 * **Iteration is by code point, not by code unit.** `for (const c of text)` walks surrogate pairs as
 * one character, so an emoji encodes to the four bytes its code point requires rather than to two
 * unpaired surrogates — which is the difference between a digest that matches every other SHA-256
 * implementation and one that only matches itself. A lone surrogate, which is a legal JavaScript
 * string and not legal UTF-8, is encoded as U+FFFD, the same substitution `TextEncoder` makes.
 */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (const character of text) {
    let code = character.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(out);
}

/**
 * SHA-256 of a byte sequence, as 64 lower-case hex characters.
 *
 * The length is appended as a 64-bit big-endian **bit** count. It is written as two 32-bit halves
 * because a JavaScript number cannot hold a 64-bit integer exactly — and the high half is computed
 * by division rather than by shifting, since `<<` and `>>>` truncate to 32 bits and would silently
 * write zero for any input over 512 MiB.
 */
export function sha256(bytes: Uint8Array): string {
  const bitLength = bytes.length * 8;
  // One 0x80 byte, then zeroes, so that the total is 56 mod 64; then 8 bytes of length.
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const lengthAt = padded.length - 8;
  // 2**32 as a divisor rather than a shift: `bitLength >>> 32` is 0 for every value in JS.
  const highBits = Math.floor(bitLength / 0x100000000);
  padded[lengthAt] = (highBits >>> 24) & 0xff;
  padded[lengthAt + 1] = (highBits >>> 16) & 0xff;
  padded[lengthAt + 2] = (highBits >>> 8) & 0xff;
  padded[lengthAt + 3] = highBits & 0xff;
  padded[lengthAt + 4] = (bitLength >>> 24) & 0xff;
  padded[lengthAt + 5] = (bitLength >>> 16) & 0xff;
  padded[lengthAt + 6] = (bitLength >>> 8) & 0xff;
  padded[lengthAt + 7] = bitLength & 0xff;

  const h = Int32Array.from(H0);
  const w = new Int32Array(64);

  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) {
      const at = block + i * 4;
      w[i] =
        ((padded[at]! << 24) | (padded[at + 1]! << 16) | (padded[at + 2]! << 8) | padded[at + 3]!) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]! >>> 0;
      const y = w[i - 2]! >>> 0;
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = ((w[i - 16]! + s0 + w[i - 7]! + s1) | 0) >>> 0 | 0;
    }

    let a = h[0]! >>> 0;
    let b = h[1]! >>> 0;
    let c = h[2]! >>> 0;
    let d = h[3]! >>> 0;
    let e = h[4]! >>> 0;
    let f = h[5]! >>> 0;
    let g = h[6]! >>> 0;
    let hh = h[7]! >>> 0;

    for (let i = 0; i < 64; i++) {
      const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + s1 + ch + K[i]! + (w[i]! >>> 0)) >>> 0;
      const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) | 0;
    h[1] = (h[1]! + b) | 0;
    h[2] = (h[2]! + c) | 0;
    h[3] = (h[3]! + d) | 0;
    h[4] = (h[4]! + e) | 0;
    h[5] = (h[5]! + f) | 0;
    h[6] = (h[6]! + g) | 0;
    h[7] = (h[7]! + hh) | 0;
  }

  let out = "";
  for (const word of h) out += (word >>> 0).toString(16).padStart(8, "0");
  return out;
}

/** SHA-256 of a string's UTF-8 bytes. The form every caller in this package actually wants. */
export function sha256Text(text: string): string {
  return sha256(utf8Bytes(text));
}
