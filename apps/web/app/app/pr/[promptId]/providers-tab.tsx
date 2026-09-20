import { MODEL_CATALOGUE, PROVIDERS, type ProviderName } from "@41prompts/db";

/**
 * The fourth of the mockup's four tabs (line 1115).
 *
 * ## What it can honestly say, and what it cannot
 *
 * The mockup's Providers tab is not drawn — the tab strip has the word and the panel behind it was
 * never designed. So this is built from what the product actually has: EPIC-042's pinned catalogue,
 * and whether this account has a key for each provider.
 *
 * **It does not say which models this prompt has run on.** That is a fact about runs, it lives on
 * the Runs page, and EPIC-042's matrix already shows it per check and per input. Repeating a
 * summary of it here would be a second copy of a number with no way to keep the two agreeing.
 *
 * ## Pinned ids, shown as pinned ids
 *
 * `CLAUDE.md` rule 7: a judge is pinned by version and never a floating alias, and the same holds
 * for anything whose cost is charged to somebody. The id is the thing that is pinned, so the id is
 * shown next to the name rather than hidden behind it.
 */
export function ProvidersTab({ keyed }: { keyed: Readonly<Record<ProviderName, boolean>> }) {
  return (
    <div className="providers-tab">
      <p className="providers-tab-lede">
        A run uses one model at a time, pinned by version. These are the models this workspace can
        reach; a key is per account, not per prompt.
      </p>

      {PROVIDERS.map((provider) => (
        <section key={provider} className="providers-group" aria-label={provider}>
          <h3 className="providers-group-name">
            {provider}
            {/* Words, not a dot. Rule 10: never a colour alone, and this is not pass/fail/drift
                anyway — it is "we can call this or we cannot". */}
            <span className="providers-group-state">
              {keyed[provider] ? "key stored" : "no key"}
            </span>
          </h3>
          <ul className="providers-models">
            {MODEL_CATALOGUE.filter((model) => model.provider === provider).map((model) => (
              <li key={model.id}>
                <span className="providers-model-name">{model.name}</span>
                <span className="providers-model-id mono">{model.id}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="providers-tab-foot">
        <a href="/app/settings/providers">Settings → Providers</a> is where a key is added, tested
        and rotated.
      </p>
    </div>
  );
}
