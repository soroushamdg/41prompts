import { PROVIDERS, providerKeyMetadata, type Db, type ProviderKeyMetadata, type ProviderName } from "@41prompts/db";

/**
 * What the settings page reads, and what deciding "run on every provider" reads.
 *
 * **No master key is needed for any of this**, and the types say so: `providerKeyMetadata` cannot
 * produce a plaintext key and does not take an environment. A page that renders somebody's key
 * store should not be one envelope away from their credential.
 */

export interface ProviderRow {
  readonly provider: ProviderName;
  /** `undefined` when nothing is stored, which is the state most people are in. */
  readonly key: ProviderKeyMetadata | undefined;
}

/** One row per provider, always all three, in catalogue order. A missing key is a state, not a gap. */
export async function providerRowsFor(db: Db, owner: string): Promise<readonly ProviderRow[]> {
  const stored = await providerKeyMetadata(db, owner);
  const byProvider = new Map(stored.map((key) => [key.provider, key]));
  return PROVIDERS.map((provider) => ({ provider, key: byProvider.get(provider) }));
}

/**
 * The providers a run could use **this person's own key** at, in catalogue order.
 *
 * Deliberately not "the providers a run could reach": the deployment's own keys can also answer, and
 * `apps/worker`'s `providerForRun` falls back to them. This is the narrower question, and it is the
 * right one for "run on every provider" — a person pressing that means *their* keys. Widening it to
 * the deployment's would run their prompt three times on our money without their having asked.
 */
export async function keyedProvidersFor(db: Db, owner: string): Promise<readonly ProviderName[]> {
  const stored = await providerKeyMetadata(db, owner);
  return PROVIDERS.filter((provider) => stored.some((key) => key.provider === provider && key.enabled));
}
