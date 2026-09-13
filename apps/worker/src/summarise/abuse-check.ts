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

/**
 * ## The numbers below are defaults, and the deployed values are deliberately different
 *
 * This file is readable by anyone: the repository is public for a limited period. The budget was
 * always the real defence — the phrase list below says so itself and always has — but it was sized
 * on the assumption that an attacker had to *discover* the bound by probing. Published, the bound
 * stops being a bound and becomes an instruction: stay under 200 an hour and 4,000 characters and
 * you are never refused.
 *
 * So each of the three is read from the environment, and **staging and production set values that
 * are not these**. What is written here is the local-development default and the test fixture. It
 * is not what is deployed, and reading this file tells you nothing about what is deployed beyond
 * the shape of the check.
 *
 * Two consequences worth stating rather than leaving to be discovered:
 *
 * 1. **A malformed value falls back to the default rather than crashing the worker**, because a
 *    typo in a dashboard should not take summarisation down. It would, however, silently restore
 *    the published number — which is the exact failure this change exists to prevent — so every
 *    bad value is collected in `misconfiguredBudgetEnv` and the worker logs it at startup. An
 *    empty log line there is part of the check, not noise.
 * 2. **Changing these does not invalidate any cache.** They gate whether a model is asked at all;
 *    they are not part of `MODEL_SUMMARISER_VERSION`.
 */
const BUDGET_ENV = {
  maxBlokCharacters: "SUMMARY_MAX_BLOK_CHARACTERS",
  budgetPerWindow: "SUMMARY_BUDGET_PER_WINDOW",
  windowMs: "SUMMARY_BUDGET_WINDOW_MS"
} as const;

const misconfigured: string[] = [];

/**
 * Reads a positive integer from the environment, or returns the default.
 *
 * Unset and empty both mean "use the default" and are not misconfiguration — that is the local
 * and test case. Anything else that is not a positive finite integer is, and is recorded.
 */
export function readPositiveInt(
  name: string,
  fallback: number,
  env: Readonly<Record<string, string | undefined>> = process.env,
  onBad: (name: string) => void = (n) => misconfigured.push(n)
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    onBad(name);
    return fallback;
  }
  return parsed;
}

/** Environment variable names that held an unusable value and fell back to the published default. */
export function misconfiguredBudgetEnv(): readonly string[] {
  return misconfigured;
}

/** Characters of a single blok worth sending. Beyond this the heuristic is used. */
export const MAX_BLOK_CHARACTERS = readPositiveInt(BUDGET_ENV.maxBlokCharacters, 4_000);

/** Bloks one caller may have summarised by a model per window. */
export const MODEL_SUMMARY_BUDGET = readPositiveInt(BUDGET_ENV.budgetPerWindow, 200);

export const BUDGET_WINDOW_MS = readPositiveInt(BUDGET_ENV.windowMs, 60 * 60 * 1000);

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
