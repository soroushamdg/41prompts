import { createHash, timingSafeEqual } from "node:crypto";

// SHA-256, not a slow password hash: an api key is a high-entropy random token, not a
// low-entropy human password, so there is no offline-guessing risk to slow down for — and this
// hash runs on every request that presents a key. "no key material in plaintext, ever"
// (decision 4) is met by never storing `plaintext` itself, only this digest plus the last four
// characters kept for UI display.
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function lastFourOf(plaintext: string): string {
  return plaintext.slice(-4);
}

// Constant-time comparison so a timing side channel can't leak how many hash bytes matched.
export function verifyApiKey(plaintext: string, hashedKey: string): boolean {
  const candidate = Buffer.from(hashApiKey(plaintext), "hex");
  const stored = Buffer.from(hashedKey, "hex");
  if (candidate.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(candidate, stored);
}
