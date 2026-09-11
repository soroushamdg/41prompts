import { heuristicSummariser, type AsyncSummariser, type Blok, type Summary } from "@41prompts/core";
import { checkForAbuse, createMemoryBudget, type AbuseVerdict, type BudgetStore } from "./abuse-check";

/**
 * The model summariser with the abuse check in front of it.
 *
 * **The check runs before the provider call, not around it** (EPIC-014 decision 7). That ordering is
 * the whole point: a guard that lets the request go and discards the answer has already paid for it.
 * The wrapper exists precisely so `createModelSummariser` cannot be reached without passing the
 * check, rather than relying on every future caller remembering to ask first.
 *
 * On refusal the heuristic summary is returned. Not an error, and not an empty card: the reader has
 * usually done nothing wrong — their blok was long, or they are the two-hundred-and-first this hour —
 * and the cost of the refusal should land on the quality of one line, not on their decompile.
 */

export interface GuardedSummariserOptions {
  /** The real summariser. Only reached when the check passes. */
  readonly model: AsyncSummariser;
  readonly budget?: BudgetStore;
  /** Called on every refusal, for the log line. Never given the source text. */
  readonly onRefused?: (reason: Exclude<AbuseVerdict, { allowed: true }>["reason"]) => void;
  readonly now?: () => number;
}

export function createGuardedSummariser(options: GuardedSummariserOptions): AsyncSummariser & {
  summariseFor(blok: Blok, source: string, callerHash: string | null): Promise<Summary>;
} {
  const budget = options.budget ?? createMemoryBudget();

  async function summariseFor(blok: Blok, source: string, callerHash: string | null): Promise<Summary> {
    const text = blok.ranges.map((range) => source.slice(range.start, range.end)).join("\n\n");
    const verdict = checkForAbuse({ text, callerHash, budget, now: options.now?.() });

    if (!verdict.allowed) {
      try {
        options.onRefused?.(verdict.reason);
      } catch {
        // A logger that throws must not turn a handled refusal into a failed decompile.
      }
      // Returned before the model is touched. The heuristic's summary carries the heuristic's own
      // cache key, so a refused one can never be mistaken for, or serve as, a cached model summary.
      return heuristicSummariser.summarise(blok, source);
    }

    return options.model.summarise(blok, source);
  }

  return {
    version: options.model.version,
    // The plain `Summariser` shape, for callers that have no caller to attribute — they share the
    // anonymous budget, which is the conservative reading rather than an exemption.
    summarise: (blok, source) => summariseFor(blok, source, null),
    summariseFor
  };
}
