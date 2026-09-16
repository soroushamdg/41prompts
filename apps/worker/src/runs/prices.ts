/**
 * What each model costs, dated and sourced.
 *
 * `roadmap.md`'s review line for this epic: *"Price table sourced and dated."* Both are here on every
 * row, because a price with no date is a number nobody can check and a number nobody can check is
 * how a budget quietly stops meaning anything.
 *
 * ## Prices are per million tokens, in cents
 *
 * Cents because `run_budgets` is already integer cents and a second unit is a second conversion to
 * get wrong. Per million because that is how providers publish, so a row can be compared to its
 * source without arithmetic.
 *
 * ## A model absent from this table does not run
 *
 * EPIC-031 decision 4. There is no list price to reserve against, and **reserving against a price you
 * do not have is not a reservation**. The alternative — assume zero — spends nothing against a budget
 * whose entire job is to stop spending, which is the worst available failure: it looks like it works.
 *
 * Adding a model is adding a row here, with the date it was read and the URL it came from.
 */

import type { ProviderName } from "@41prompts/db";

export interface ModelPrice {
  /** Who is charging. Chooses the adapter and the concurrency, and names the column in the matrix. */
  readonly provider: ProviderName;
  /** Cents per million input tokens. */
  readonly inputCentsPerMillion: number;
  /** Cents per million output tokens. */
  readonly outputCentsPerMillion: number;
  /** The most output this model will produce, used for the reservation's upper bound. */
  readonly maxOutputTokens: number;
  /** When this row was last read from the source below. */
  readonly readOn: string;
  readonly source: string;
}

const ANTHROPIC_PRICING = "https://docs.anthropic.com/en/docs/about-claude/pricing";
const OPENAI_PRICING = "https://platform.openai.com/docs/pricing";
const GOOGLE_PRICING = "https://ai.google.dev/gemini-api/docs/pricing";

/**
 * **Pinned ids, never aliases.** A row keyed on a floating alias cannot answer what actually ran, and
 * `CLAUDE.md` rule 7 already forbids a floating alias for grading — the same reasoning applies to
 * anything whose cost is being charged to somebody.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5": {
    provider: "anthropic",
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 7500,
    maxOutputTokens: 32_000,
    readOn: "2026-09-14",
    source: ANTHROPIC_PRICING
  },
  "claude-sonnet-5": {
    provider: "anthropic",
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    maxOutputTokens: 64_000,
    readOn: "2026-09-14",
    source: ANTHROPIC_PRICING
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 500,
    maxOutputTokens: 64_000,
    readOn: "2026-09-14",
    source: ANTHROPIC_PRICING
  },

  // ── EPIC-042 ────────────────────────────────────────────────────────────────────────────────
  //
  // Read from each provider's own pricing page on 2026-09-16, standard (not batch, not priority,
  // not cached-input) rates, and converted to cents per million.
  //
  // **`maxOutputTokens` is the model's documented ceiling, not `RUN_PARAMS.maxOutputTokens`.** It
  // sizes the reservation, and the reservation exists to make the cap unbreachable — so it has to
  // be the worst case the model could produce, not the cap this product happens to send today.
  "gpt-4.1-2025-04-14": {
    provider: "openai",
    inputCentsPerMillion: 200,
    outputCentsPerMillion: 800,
    maxOutputTokens: 32_768,
    readOn: "2026-09-16",
    source: OPENAI_PRICING
  },
  "gpt-4.1-mini-2025-04-14": {
    provider: "openai",
    inputCentsPerMillion: 40,
    outputCentsPerMillion: 160,
    maxOutputTokens: 32_768,
    readOn: "2026-09-16",
    source: OPENAI_PRICING
  },

  // **Gemini 2.5 Pro is priced in two bands** — $1.25/M below a 200k-token prompt and $2.50/M above
  // it, with output $10/M and $15/M. The row carries the **lower** band because `MAX_INPUTS` and
  // `RUN_PARAMS` put every run this product makes far below the threshold, and a two-band price is
  // a second thing for `costCentsFor` to get wrong. **If a longer-context run is ever built, this
  // row under-charges** and that is written here rather than discovered in a bill.
  "gemini-2.5-pro": {
    provider: "google",
    inputCentsPerMillion: 125,
    outputCentsPerMillion: 1000,
    maxOutputTokens: 65_536,
    readOn: "2026-09-16",
    source: GOOGLE_PRICING
  },
  "gemini-2.5-flash": {
    provider: "google",
    inputCentsPerMillion: 30,
    outputCentsPerMillion: 250,
    maxOutputTokens: 65_536,
    readOn: "2026-09-16",
    source: GOOGLE_PRICING
  }
};

/**
 * How many calls this product will have in flight at one provider, for one run.
 *
 * **Three different numbers for three stated reasons**, rather than one number parameterised by
 * provider — the point of a per-provider limit is that the providers differ, and a table of equal
 * numbers would be a mechanism with nothing in it.
 *
 * - **`anthropic: 2`.** The lowest published tier is 50 requests a minute, so two in flight has
 *   very wide headroom, and this is the provider the platform's own key is at.
 * - **`openai: 4`.** Tier 1 on the chat endpoint is several hundred requests a minute. Four is
 *   still conservative and is where the wall-clock gain actually shows.
 * - **`google: 1`.** The unpaid Gemini quota is the one a person is most likely to bring, and it is
 *   limited in requests **per minute** — single digits on some models. Concurrency cannot help with
 *   an RPM limit; it only reaches it sooner, and **nothing in this epic retries a 429**. One is the
 *   honest number until a retry policy exists.
 *
 * Read on 2026-09-16 from the same pages as the prices above. These are deliberately below every
 * published tier-1 limit rather than tuned to one, because the tier a person's key is on is
 * something this product cannot see.
 */
export const PROVIDER_CONCURRENCY: Readonly<Record<ProviderName, number>> = {
  anthropic: 2,
  openai: 4,
  google: 1
};

export function concurrencyForModel(model: string): number {
  const price = priceFor(model);
  return price === undefined ? 1 : PROVIDER_CONCURRENCY[price.provider];
}

export function priceFor(model: string): ModelPrice | undefined {
  return MODEL_PRICES[model];
}

/**
 * What a call cost, from what it actually used.
 *
 * Rounded **up**. A fraction of a cent rounded down, a few hundred thousand times, is a budget that
 * under-counts — and a budget that under-counts is one that does not hold.
 */
export function costCentsFor(price: ModelPrice, inputTokens: number, outputTokens: number): number {
  const input = (inputTokens * price.inputCentsPerMillion) / 1_000_000;
  const output = (outputTokens * price.outputCentsPerMillion) / 1_000_000;
  return Math.ceil(input + output);
}

/**
 * What to reserve **before** the call, when nobody knows yet what it will produce.
 *
 * EPIC-031 decision 3: input tokens plus the model's maximum output, at list price. Deliberately the
 * worst case — the reservation exists to make the cap unbreachable, and a reservation that is
 * sometimes too small is a cap that is sometimes not a cap.
 *
 * The overshoot is released on reconciliation, so the cost of being pessimistic is that a user hits
 * their cap slightly early, not that they are charged for it.
 */
export function reservationCentsFor(price: ModelPrice, inputTokens: number): number {
  return costCentsFor(price, inputTokens, price.maxOutputTokens);
}
