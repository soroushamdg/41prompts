// A soft-deleted user's row is purged this many days after `users.deletedAt` is set.
// Product promise (EPIC-002 decision 5): the window itself, not just its enforcement,
// must never be a bare literal in the code that checks it.
export const ACCOUNT_PURGE_WINDOW_DAYS = 30;

/**
 * An anonymous decompile is hard-purged this many days after it was created.
 *
 * The number the page promises before anyone shares a link (EPIC-014 decision 3), so it must never be
 * a bare literal in the job that enforces it. A soft delete is explicitly not enough here: the row
 * goes, because "we still have it but marked it deleted" is not what the sentence on the page says.
 */
export const DECOMPILE_RETENTION_DAYS = 30;


/**
 * A counted run is kept this many days.
 *
 * Longer than `DECOMPILE_RETENTION_DAYS` because this is the measurement rather than the content:
 * M1's window closes at thirty days and EPIC-084 reads the same rows afterwards, so purging at
 * thirty would delete the evidence on the day it is needed. Six months is enough for both and is
 * still a promise that nothing here is kept forever.
 *
 * The row holds no prompt text — a keyed hash, two integers and a timestamp.
 */
export const RUN_COUNT_RETENTION_DAYS = 180;

/**
 * A run's raw provider payload is kept this many days.
 *
 * **The number the privacy page promises** (EPIC-017's retention table), so it must never be a bare
 * literal in the job that enforces it — the same rule the three constants above live under, and the
 * mechanism that stops the page and the code drifting apart.
 *
 * 365 rather than "12 months" because a purge does arithmetic in days and months are not a unit it
 * can use. The page may say either; the enforcement says this.
 *
 * **This is the privacy-sensitive column in the whole run record.** The payload is whatever a model
 * said about whatever a user put in, which is the one thing in a run that cannot be predicted, and
 * the clock on it is why `runs.purgeAfter` is a stored column rather than a policy somebody
 * remembers.
 */
export const RUN_PAYLOAD_RETENTION_DAYS = 365;

// ── EPIC-032: the contract between `apps/web` and `apps/worker` ───────────────────────────────
//
// Three values both processes must agree on, in the one package they both already depend on.
// Neither app may import the other, so the alternative was a literal written out twice — and a
// copy goes stale **silently**, which is the whole argument `apps/web/e2e/env.mjs` records one
// level down. A queue name that drifts is a trigger that enqueues into nothing: the run sits
// `queued` for ever and the page shows a spinner that never ends.

/** The pg-boss queue a triggered run is sent on. The web sends; the worker works. */
export const RUN_SUITE_QUEUE = "run-suite";

/**
 * The providers a key may be held for, and the models this product will call.
 *
 * ## Why this is in `constants.ts` and not beside the key store
 *
 * `provider-keys.ts` owns the table and therefore imports drizzle and the schema. Both apps need
 * the *names* — `apps/web` to render a settings row and decide which runs to create, `apps/worker`
 * to pick an adapter — and neither should pull a query builder in to read a string union. This file
 * already exists to hold exactly what the two processes must agree on, and it still has no imports.
 */
export const PROVIDERS = ["anthropic", "openai", "google"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export function isProviderName(value: string): value is ProviderName {
  return (PROVIDERS as readonly string[]).includes(value);
}

/** What a person reads. Never an id, and never a marketing name a provider does not use itself. */
export const PROVIDER_LABELS: Readonly<Record<ProviderName, string>> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

/**
 * One model this product can run, as both processes see it.
 *
 * ## Pinned ids only
 *
 * `CLAUDE.md` rule 7 forbids a floating alias for grading, and EPIC-031's price table applies the
 * same reasoning to anything whose cost is charged to somebody: a row keyed on an alias cannot
 * answer what actually ran. Every id here is one a provider will keep meaning the same thing.
 *
 * **`gemini-2.5-pro` and `gemini-2.5-flash` look like aliases and are not.** Google publishes a
 * stable id and separate dated preview ids (`gemini-2.5-flash-preview-09-2025`); the stable one is
 * the pinned one, and the preview ids are the moving targets. Recorded here because the shape
 * differs from OpenAI's and somebody will otherwise "fix" it.
 */
export interface CatalogueModel {
  readonly id: string;
  readonly provider: ProviderName;
  /** What a person reads in a KPI tile or a matrix column header. */
  readonly name: string;
}

export const MODEL_CATALOGUE: readonly CatalogueModel[] = [
  { id: "claude-opus-5", provider: "anthropic", name: "Claude Opus 5" },
  { id: "claude-sonnet-5", provider: "anthropic", name: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", name: "Claude Haiku 4.5" },
  { id: "gpt-4.1-2025-04-14", provider: "openai", name: "GPT-4.1" },
  { id: "gpt-4.1-mini-2025-04-14", provider: "openai", name: "GPT-4.1 mini" },
  { id: "gemini-2.5-pro", provider: "google", name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", provider: "google", name: "Gemini 2.5 Flash" },
];

export function catalogueModel(id: string): CatalogueModel | undefined {
  return MODEL_CATALOGUE.find((model) => model.id === id);
}

export function providerOfModel(id: string): ProviderName | undefined {
  return catalogueModel(id)?.provider;
}

export function modelsForProvider(provider: ProviderName): readonly CatalogueModel[] {
  return MODEL_CATALOGUE.filter((model) => model.provider === provider);
}

/**
 * The model a run uses at each provider when nobody has chosen one.
 *
 * **The cheapest capable model at each, not the best**, because a run is a hundred calls and the
 * person is paying for them with their own key. Choosing an arbitrary model per run is Stage 5a's
 * problem; this is the default the matrix is built from.
 */
export const DEFAULT_MODEL_FOR: Readonly<Record<ProviderName, string>> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-4.1-mini-2025-04-14",
  google: "gemini-2.5-flash",
};

/**
 * The queue a request to test an already-stored provider key is sent on (EPIC-042).
 *
 * **It exists because `apps/web` must not be able to open an envelope.** Testing a key a person has
 * just pasted needs no queue — the plaintext is in hand and the web verifies it before sealing it.
 * Testing a key that is *already stored* means opening it, and opening is the worker's, so that the
 * deployment can give `web` only `KEY_ENCRYPTION_PUBLIC_KEY` (threat model finding 1, row `043a`).
 */
export const TEST_PROVIDER_KEY_QUEUE = "test-provider-key";

/**
 * The one model a run uses (EPIC-032: one provider, pinned; the matrix is EPIC-042).
 *
 * **A pinned id, never a floating alias** — `CLAUDE.md` rule 7 for grading, and the same reasoning
 * for anything whose cost is charged to somebody. `apps/worker`'s price table must carry a row for
 * it, and a test there asserts exactly that, because a model absent from the table does not run.
 */
export const DEFAULT_RUN_MODEL = DEFAULT_MODEL_FOR.anthropic;

/**
 * What is sent with every run, stored on the row as `params` (rule 6: as sent, not as configured).
 *
 * `temperature: 0` because a run that cannot be reproduced cannot be a test. The output cap is
 * modest on purpose: it bounds one answer, while the reservation still covers the model's worst
 * case, so a cap here can never make the budget under-count.
 */
export const RUN_PARAMS: Readonly<Record<string, unknown>> = { temperature: 0, maxOutputTokens: 1024 };
