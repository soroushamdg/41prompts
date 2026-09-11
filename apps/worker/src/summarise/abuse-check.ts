/**
 * The check that runs **before** any provider call (EPIC-014 decision 7).
 *
 * ## What this is not
 *
 * **It is not a content filter and must not become one.** The epic says so and it is worth repeating
 * where the code is: nothing here judges what a prompt is *about*. A prompt can be rude, political,
 * commercially sensitive or simply strange, and none of that is this function's business — people
 * paste real production prompts into this tool and a filter that refused some of them would be both
 * a betrayal and useless, since the heuristic summariser would happily describe them anyway.
 *
 * ## What it is
 *
 * A budget guard. The failure it prevents is somebody noticing that `/decompile` will send arbitrary
 * text to a model on our key and using us as a free inference endpoint. Three bounds, all about cost:
 *
 * 1. a size cap, because tokens are the bill;
 * 2. a shape check for text that is a *question for a model* rather than a prompt to be described;
 * 3. a per-caller budget, which is the only one that actually stops a determined abuser.
 *
 * When the check fails, **nothing reaches a provider** and the heuristic summary is used. The reader
 * gets a slightly duller card and never an error, because they may well have done nothing wrong.
 */

/** Characters of a single blok worth sending. Beyond this the heuristic is used. */
export const MAX_BLOK_CHARACTERS = 4_000;

/** Bloks one caller may have summarised by a model per window. */
export const MODEL_SUMMARY_BUDGET = 200;

export const BUDGET_WINDOW_MS = 60 * 60 * 1000;

export type AbuseVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "too-long" | "not-a-prompt" | "over-budget" };

/**
 * Text that is an instruction *to us* rather than a prompt to be described.
 *
 * Deliberately a short list of shapes that only make sense if somebody is trying to get an answer
 * out of the model rather than a description of their prompt. It is **not** a jailbreak detector and
 * will not catch a determined one — that is what the budget is for. This exists to make the cheap,
 * obvious case cheap to refuse.
 *
 * Every entry is a whole phrase, for the same reason `untestable.json` is: single suggestive words
 * fire on real prompts. "Write a poem about our refund policy" is a plausible thing for a support
 * prompt to contain, so `write a poem` alone is not evidence of anything.
 */
const FREE_INFERENCE_SHAPES: readonly RegExp[] = [
  /^\s*(?:please\s+)?(?:answer|solve|compute|calculate|translate)\s+(?:this|the following|it)\b/i,
  /^\s*(?:what|who|when|where|why|how)\s+(?:is|are|was|were|do|does|did)\b[^?]{0,200}\?\s*$/i,
  /\bignore (?:all )?(?:previous|prior|above) instructions\b/i,
  /^\s*(?:write|draft|compose)\s+(?:me\s+)?(?:a|an)\s+\w+\s+(?:about|on|for)\b[^.!?]{0,120}$/i
];

export interface BudgetStore {
  /** Attempts already recorded for this caller in the current window, and when it resets. */
  take(callerHash: string, now: number): { used: number; resetAt: number };
}

/** The default in-memory budget. Same single-instance caveat as the web rate limiter. */
export function createMemoryBudget(windowMs: number = BUDGET_WINDOW_MS): BudgetStore {
  const windows = new Map<string, { used: number; resetAt: number }>();
  return {
    take(callerHash, now) {
      const existing = windows.get(callerHash);
      if (existing === undefined || existing.resetAt <= now) {
        const fresh = { used: 1, resetAt: now + windowMs };
        windows.set(callerHash, fresh);
        return fresh;
      }
      existing.used += 1;
      return existing;
    }
  };
}

export interface AbuseCheckInput {
  readonly text: string;
  /** The hashed caller, never a raw address. `null` shares one budget with every other unknown caller. */
  readonly callerHash: string | null;
  readonly budget: BudgetStore;
  readonly now?: number;
}

export function checkForAbuse({ text, callerHash, budget, now = Date.now() }: AbuseCheckInput): AbuseVerdict {
  if (text.length > MAX_BLOK_CHARACTERS) return { allowed: false, reason: "too-long" };

  for (const shape of FREE_INFERENCE_SHAPES) {
    if (shape.test(text)) return { allowed: false, reason: "not-a-prompt" };
  }

  // Counted last, so a request refused on shape does not also consume budget — otherwise a caller
  // sending nonsense could exhaust their own allowance and then be refused for the wrong reason,
  // which makes the logs lie about what happened.
  const { used } = budget.take(callerHash ?? "anonymous", now);
  if (used > MODEL_SUMMARY_BUDGET) return { allowed: false, reason: "over-budget" };

  return { allowed: true };
}
