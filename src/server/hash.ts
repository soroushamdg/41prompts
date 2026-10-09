import { createHash } from "node:crypto";
import type { Blok } from "@/lib/bloks";

/** Identity of a version's content: same bloks in the same order, same hash. */
export function contentHash(bloks: Blok[]): string {
  return createHash("sha256").update(JSON.stringify(bloks.map((b) => [b.id, b.type, b.text]))).digest("base64url");
}
