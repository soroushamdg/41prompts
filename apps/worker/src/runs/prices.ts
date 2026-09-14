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

export interface ModelPrice {
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

/**
 * **Pinned ids, never aliases.** A row keyed on a floating alias cannot answer what actually ran, and
 * `CLAUDE.md` rule 7 already forbids a floating alias for grading — the same reasoning applies to
 * anything whose cost is being charged to somebody.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5": {
    inputCentsPerMillion: 1500,
    outputCentsPerMillion: 7500,
    maxOutputTokens: 32_000,
    readOn: "2026-09-14",
    source: ANTHROPIC_PRICING
  },
  "claude-sonnet-5": {
    inputCentsPerMillion: 300,
    outputCentsPerMillion: 1500,
    maxOutputTokens: 64_000,
    readOn: "2026-09-14",
    source: ANTHROPIC_PRICING
  },
  "claude-haiku-4-5-20251001": {
    inputCentsPerMillion: 100,
    outputCentsPerMillion: 500,
    maxOutputTokens: 64_000,
    readOn: "2026-09-14",
    source: ANTHROPIC_PRICING
  }
};

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
