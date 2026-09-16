"use server";

import {
  deleteProviderKey,
  isProviderName,
  PROVIDER_TITLES,
  putProviderKey,
  refusalWords,
  recordProviderKeyTest,
  requestProviderKeyTest,
  setProviderKeyEnabled,
  verifyProviderKeyOrFake,
} from "@41prompts/db";
import { createLogger } from "@41prompts/logger";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { enqueueKeyTest } from "@/lib/runs/queue";

/**
 * Server actions for a person's provider keys.
 *
 * Every one follows the same four steps as the canvas's and the runs': **resolve the session, scope
 * by owner, validate, write** — and then `revalidatePath`, every time.
 *
 * ## The one rule this file holds
 *
 * **A key is verified before it is sealed, and a key the provider rejects is not stored.** Nothing
 * here logs the plaintext, returns it, or puts it in a message; `saveProviderKeyAction` is the only
 * function in `apps/web` that has ever held one, and it holds it for one provider call and one
 * `putProviderKey`.
 */

const SETTINGS_PATH = "/app/settings/providers";
const logger = createLogger("web");

export interface ProviderActionResult {
  ok: boolean;
  /** Shown to the person. Present only when `ok` is false, or as a confirmation when it is true. */
  message?: string;
}

async function ownerAnd(provider: string) {
  const session = await requireSession(SETTINGS_PATH);
  if (!isProviderName(provider)) return undefined;
  return { owner: session.user.id, provider, db: getDb() };
}

/**
 * Store a key, having first asked the provider whether it is real.
 *
 * The three refusals a person can meet, in the order they are checked: it is not a provider we
 * support; it is empty; the provider would not take it. Only the third costs a network call, and
 * none of them writes anything.
 */
export async function saveProviderKeyAction(provider: string, key: string): Promise<ProviderActionResult> {
  const found = await ownerAnd(provider);
  if (found === undefined) return { ok: false, message: "That is not a provider we can store a key for." };

  const plaintext = key.trim();
  if (plaintext === "") return { ok: false, message: "Paste a key first." };

  const { verdict, usedFake } = await verifyProviderKeyOrFake(found.provider, plaintext);
  if (usedFake) {
    // Guard 3: a process answering with a fake must never be quiet about it.
    logger.warn({ provider: found.provider }, "provider key verified by the deterministic fake (FAKE_PROVIDER=1)");
  }

  if (!verdict.ok) {
    // The provider's own status is the reason; its body is not shown, because a body is where a
    // provider echoes back the thing it was sent.
    return { ok: false, message: refusalWords(found.provider, verdict.reason, PROVIDER_TITLES[found.provider]) };
  }

  const stored = await putProviderKey(found.db, { owner: found.owner, provider: found.provider, plaintext });
  revalidatePath(SETTINGS_PATH);
  return {
    ok: true,
    message: `${PROVIDER_TITLES[found.provider]} accepted that key, and it is stored. We show the last four characters (${stored.lastFour}) and nothing else.`,
  };
}

/** Switch a stored key off or on. Off means runs do not reach for it; the key itself stays. */
export async function setProviderKeyEnabledAction(provider: string, enabled: boolean): Promise<ProviderActionResult> {
  const found = await ownerAnd(provider);
  if (found === undefined) return { ok: false, message: "That is not a provider we can store a key for." };

  const row = await setProviderKeyEnabled(found.db, found.owner, found.provider, enabled);
  if (row === undefined) return { ok: false, message: "There is no key stored for that provider." };

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/**
 * Ask the worker to test a key that is already stored.
 *
 * **This is the whole reason a queue exists.** Testing a stored key means opening a sealed
 * envelope, and only the worker may hold the master secret (threat model row `043a`). So this marks
 * the row as being checked and sends a job; the verdict arrives on the row and the page polls for
 * it.
 *
 * If the queue will not take it, the request is cleared rather than left saying "checking" for
 * ever — the same reasoning as a run row with nothing behind it.
 */
export async function testProviderKeyAction(provider: string): Promise<ProviderActionResult> {
  const found = await ownerAnd(provider);
  if (found === undefined) return { ok: false, message: "That is not a provider we can store a key for." };

  const row = await requestProviderKeyTest(found.db, found.owner, found.provider);
  if (row === undefined) return { ok: false, message: "There is no key stored for that provider." };

  try {
    await enqueueKeyTest(found.owner, found.provider);
  } catch {
    // **Clear the request rather than leaving it.** A row that says "checking" with nothing behind
    // it is the spinner-that-never-ends failure EPIC-032 named, on a settings page instead of a run.
    await recordProviderKeyTest(found.db, found.owner, found.provider, {
      ok: false,
      detail: "We could not reach the part of the service that checks a stored key. This says nothing about the key itself.",
    });
    revalidatePath(SETTINGS_PATH);
    return { ok: false, message: "We could not ask the worker to check that key just now. Try again in a moment." };
  }

  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}

/** Forget a key. The stored copy goes; revoking it at the provider is still theirs to do. */
export async function removeProviderKeyAction(provider: string): Promise<ProviderActionResult> {
  const found = await ownerAnd(provider);
  if (found === undefined) return { ok: false, message: "That is not a provider we can store a key for." };

  const removed = await deleteProviderKey(found.db, found.owner, found.provider);
  revalidatePath(SETTINGS_PATH);
  return removed
    ? {
        ok: true,
        message: `We have forgotten your ${PROVIDER_TITLES[found.provider]} key. It is still valid at ${PROVIDER_TITLES[found.provider]} until you revoke it there.`,
      }
    : { ok: false, message: "There was no key stored for that provider." };
}
