"use server";

import { clientAddress, decompiles, hashIdentity, waitlist } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { byteLength, MAX_INPUT_BYTES } from "@/lib/decompile/limits";
import { checkLimit, SHARE_LIMIT, WAITLIST_LIMIT } from "@/lib/decompile/rate-limit";
import { verifyTurnstile } from "@/lib/decompile/turnstile";
import type { ShareState, WaitlistState } from "@/lib/decompile/share-state";

/**
 * Creating a permalink, removing one, and the waitlist.
 *
 * Only async functions may be exported from a `"use server"` module — Next 16 rejects a constant or
 * a type here at request time with a 500 rather than at typecheck (learned the hard way in
 * EPIC-013), so the shapes live in `lib/decompile/share-state`.
 */

async function callerHash(): Promise<{ ip: string | null; ipHash: string | null; userAgentHash: string | null }> {
  const header = await headers();
  const ip = clientAddress(header);
  return {
    ip,
    ipHash: hashIdentity(ip),
    userAgentHash: hashIdentity(header.get("user-agent"))
  };
}

export async function shareDecompile(_previous: ShareState, formData: FormData): Promise<ShareState> {
  const source = typeof formData.get("source") === "string" ? (formData.get("source") as string) : "";
  if (source.trim().length === 0) return { status: "error", message: "There is nothing to share yet." };
  if (byteLength(source) > MAX_INPUT_BYTES) {
    return { status: "error", message: "That prompt is too large to share." };
  }

  const { ip, ipHash, userAgentHash } = await callerHash();

  const limit = checkLimit(ipHash, SHARE_LIMIT);
  if (!limit.allowed) return { status: "error", message: limit.message ?? "That is the limit for now." };

  // Turnstile guards this path and nothing else. Unconfigured it is skipped and the rate limit above
  // is what stands — the path is guarded either way, just not by this.
  const check = await verifyTurnstile({ token: formData.get("turnstileToken")?.toString(), remoteIp: ip });
  if (!check.ok) return { status: "error", message: check.message };

  // Stored exactly as received. The offsets a decompile produces index this string, and the browser
  // has already normalised it to CRLF on submit — "tidying" it here would move every range.
  const [row] = await getDb()
    .insert(decompiles)
    .values({ source, ipHash, userAgentHash })
    .returning({ id: decompiles.id });

  if (row === undefined) return { status: "error", message: "The link could not be made. Try again." };
  return { status: "shared", id: row.id };
}

export async function removeDecompile(_previous: unknown, formData: FormData): Promise<{ status: "removed" | "error"; message?: string }> {
  const id = formData.get("id");
  if (typeof id !== "string" || id.length === 0) return { status: "error", message: "Nothing to remove." };

  // **Anyone holding the link can delete it, with no account** (decision 4). That is the point: this
  // is the path somebody uses when they realise they pasted something they should not have, and
  // putting a sign-in between them and the delete button would make it useless exactly when it
  // matters. The id is the capability — twelve hex digits, unguessable, and the only way to reach
  // this is to already have it.
  await getDb().delete(decompiles).where(eq(decompiles.id, id));
  return { status: "removed" };
}

export async function joinWaitlist(_previous: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const raw = formData.get("email");
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  // Deliberately permissive. The strictest honest check for an address is whether mail to it
  // arrives, and rejecting something that looks odd but works is worse than storing one that bounces.
  if (email.length === 0 || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    return { status: "error", message: "That does not look like an email address." };
  }

  const { ipHash } = await callerHash();
  const limit = checkLimit(ipHash, WAITLIST_LIMIT);
  if (!limit.allowed) return { status: "error", message: limit.message ?? "That is the limit for now." };

  // A duplicate is a success, not an error (decision 8). Somebody who signs up twice has done nothing
  // wrong, and telling them "you are already on the list" reveals whether an address is on it to
  // anybody who cares to ask. `onConflictDoNothing` also means a second sign-up cannot revive an
  // unsubscribed row, which would turn an unsubscribe into a temporary one.
  await getDb().insert(waitlist).values({ email }).onConflictDoNothing({ target: waitlist.email });
  return { status: "joined" };
}

export async function unsubscribeFromWaitlist(email: string): Promise<void> {
  await getDb()
    .update(waitlist)
    .set({ unsubscribedAt: new Date() })
    .where(eq(waitlist.email, email.trim().toLowerCase()));
}
