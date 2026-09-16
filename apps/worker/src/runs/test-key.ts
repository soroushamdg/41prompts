import {
  isProviderName,
  openEnabledProviderKey,
  PROVIDER_TITLES,
  recordProviderKeyTest,
  refusalWords,
  verifyProviderKeyOrFake,
  type Db,
  type FetchLike,
} from "@41prompts/db";
import { scrubString } from "@41prompts/logger";

/**
 * Test a provider key that is **already stored**.
 *
 * ## This function is the reason the queue exists
 *
 * It opens a sealed envelope, which means it needs `KEY_ENCRYPTION_SECRET`, which means it may only
 * run here — `apps/web` is the process on the internet and threat-model finding 1 (row `043a`) is
 * about not giving it the master secret. A key somebody has just pasted needs none of this: the web
 * has the plaintext in hand and verifies it before sealing it.
 *
 * ## What is written down, and what is not
 *
 * The verdict and a short sentence. **The plaintext exists inside this function and nowhere else**:
 * it is not returned, not logged, not put in the row, and not carried into the error path. The
 * sentence goes through `scrubString` first — belt and braces, because `verifyProviderKey` already
 * keeps the key out of every URL it builds, and because this is the one string from this subsystem
 * that a page renders.
 *
 * ## A key that could not be reached is not a key that failed
 *
 * `unreachable` is recorded as a failure with the provider's own words, because the row has only a
 * boolean — and the sentence is what tells a person the difference. Making it a third state would
 * mean a column with three values whose only reader is one line of a settings page.
 */
export async function testStoredProviderKey(
  db: Db,
  owner: string,
  provider: string,
  fetchImpl?: FetchLike,
  /** Guard 3: the caller announces the fake. Passed in so this module does no logging of its own. */
  onFake?: (provider: string) => void,
): Promise<boolean> {
  if (!isProviderName(provider)) {
    // A job naming a provider that does not exist cannot be about a row, so there is nothing to
    // write a verdict onto. Loud rather than silent: the caller logs the `false`.
    return false;
  }

  const plaintext = await openEnabledProviderKey(db, owner, provider);
  if (plaintext === undefined) {
    await recordProviderKeyTest(db, owner, provider, {
      ok: false,
      detail: "There is no key stored for this provider, or it is switched off.",
    });
    return false;
  }

  // **Through the seam, never `verifyProviderKey` directly.** The first version of this file called
  // the verifier directly, and the e2e suite consequently made a real HTTPS call to a provider with
  // an invented key. `verifyProviderKeyOrFake` is the one place the fake lives and the one place its
  // three guards are enforced.
  const { verdict, usedFake } = await verifyProviderKeyOrFake(provider, plaintext, { fetchImpl });
  if (usedFake) onFake?.(provider);
  if (verdict.ok) {
    await recordProviderKeyTest(db, owner, provider, { ok: true });
    return true;
  }

  await recordProviderKeyTest(db, owner, provider, {
    ok: false,
    detail: scrubString(`${refusalWords(provider, verdict.reason, PROVIDER_TITLES[provider])} ${verdict.detail}`),
  });
  return false;
}
