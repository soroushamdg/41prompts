"use server";

import { KEY_ENVIRONMENTS, createApiKey, revokeApiKey, rotateApiKey, type KeyEnvironment } from "@41prompts/db";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { ownsProject } from "./queries";

/**
 * Server actions for API keys (EPIC-055).
 *
 * Same four steps as every other action file here — **resolve the session, scope by owner,
 * validate, write** — and then `revalidatePath`.
 *
 * ## The plaintext is returned once and never stored anywhere else
 *
 * `createApiKey` returns it; this hands it back to the page, which renders it once and then has
 * nothing to render on the next load. It is not put in a cookie, not written to a table, not logged.
 * **Nothing in this file logs**, which is deliberate: the one value worth redacting is the one value
 * these functions hold, and the cheapest way not to leak it into pino is to have no logger here.
 */

const KEYS_PATH = "/app/settings/keys";

export interface KeyActionResult {
  ok: boolean;
  message?: string;
  /** The new key's plaintext. Present exactly once, on the response that created it. */
  plaintext?: string;
  /** The last four of the new key, so the page can point at the row it just made. */
  lastFour?: string;
}

const NOT_YOURS: KeyActionResult = { ok: false, message: "That project is not available." };

function isEnvironment(value: string): value is KeyEnvironment {
  return (KEY_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Mint a key.
 *
 * The name is required and trimmed. A key called "" is a key nobody can tell from another one in six
 * months, and the list is the only place either of them is ever identified — the plaintext is gone.
 */
export async function createKeyAction(
  projectId: string,
  name: string,
  environment: string,
): Promise<KeyActionResult> {
  const session = await requireSession(KEYS_PATH);
  const db = getDb();
  if (!(await ownsProject(db, projectId, session.user.id))) return NOT_YOURS;

  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, message: "Give the key a name, so you can tell it apart later." };
  if (!isEnvironment(environment)) return { ok: false, message: "A key is either a live key or a test key." };

  const { key, plaintext } = await createApiKey(db, { project: projectId, name: trimmed, environment });
  revalidatePath(KEYS_PATH);
  // **No message.** "Copy it now, this is the only time it is shown" is the panel's own headline and
  // is always true of a minted key; returning it here as well printed it twice, which the drive's
  // screenshot showed. `message` is for what is specific to *this* act — see `rotateKeyAction`.
  return { ok: true, plaintext, lastFour: key.lastFour };
}

/**
 * Rotate a key: the old one stops working immediately and a new one takes its name.
 *
 * Two rows, not an update (ruling 6). The message says the old one has stopped rather than leaving a
 * person to infer it — a rotation that silently keeps working is the failure people assume, and a
 * rotation that silently stopped an application is the one they meet.
 */
export async function rotateKeyAction(projectId: string, keyId: string): Promise<KeyActionResult> {
  const session = await requireSession(KEYS_PATH);
  const db = getDb();
  if (!(await ownsProject(db, projectId, session.user.id))) return NOT_YOURS;

  const rotated = await rotateApiKey(db, { project: projectId, keyId });
  if (rotated === undefined) {
    return { ok: false, message: "That key is not one this project can rotate. It may already have been revoked." };
  }

  revalidatePath(KEYS_PATH);
  return {
    ok: true,
    plaintext: rotated.plaintext,
    lastFour: rotated.key.lastFour,
    // Only the part the panel's headline does not already say.
    message: `The key ending ${rotated.revoked.lastFour} has stopped working.`,
  };
}

/** Revoke a key. Idempotent underneath, and the message says which of the two happened. */
export async function revokeKeyAction(projectId: string, keyId: string): Promise<KeyActionResult> {
  const session = await requireSession(KEYS_PATH);
  const db = getDb();
  if (!(await ownsProject(db, projectId, session.user.id))) return NOT_YOURS;

  const moved = await revokeApiKey(db, { project: projectId, keyId });
  revalidatePath(KEYS_PATH);
  return moved
    ? { ok: true, message: "That key has stopped working. Anything still using it will stop resolving." }
    : { ok: false, message: "That key was already revoked." };
}
