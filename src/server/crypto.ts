import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/* Model credentials are encrypted at rest with AES-256-GCM (M07). The
   additional authenticated data binds each ciphertext to its user, its model
   and where it may be sent, so a row copied onto another account or pointed
   at another host fails to decrypt. The key version allows rotating
   KEYS_ENCRYPTION_KEY later without a migration. */

export const KEY_VERSION = 1;

function masterKey(version = KEY_VERSION): Buffer {
  const raw = version === 1 ? process.env.KEYS_ENCRYPTION_KEY : process.env[`KEYS_ENCRYPTION_KEY_V${version}`];
  if (!raw) throw new Error("KEYS_ENCRYPTION_KEY is not set. See .env.example.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("KEYS_ENCRYPTION_KEY must be 32 bytes, base64.");
  return key;
}

export type Sealed = { ciphertext: string; iv: string; authTag: string; keyVersion: number };

export function seal(plaintext: string, aad: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), keyVersion: KEY_VERSION };
}

export function open(sealed: Sealed, aad: string): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(sealed.keyVersion), Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/** AAD for one model's credentials. `destination` comes from destinationOf(). */
export const connectionAad = (userId: string, connectionId: string, destination: string) => JSON.stringify(["mc1", userId, connectionId, destination]);
