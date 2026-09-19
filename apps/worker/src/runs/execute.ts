import { runs, type Db } from "@41prompts/db";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { withReservation } from "../budgets/increment-run-budget";
import { purgeAfterFor } from "../jobs/purge-run-payloads";
import { costCentsFor, priceFor, reservationCentsFor } from "./prices";

/**
 * Running one prompt against one input, safely.
 *
 * "Safely" is four separate promises and each has its own failure it is preventing:
 *
 * - **Nothing runs without a price** (decision 4), so a budget cannot be spent against a number
 *   nobody has.
 * - **Nothing exceeds the cap** (decision 3), because the worst case is reserved before the call.
 * - **Nothing is called twice for the same question** (decision 5), because the cache answers first.
 * - **Nothing is kept forever** (decision 1), because the row is stamped with its own purge date at
 *   the moment it is written.
 */

/** What the provider has to do, and nothing more. Every test uses a fake; no test calls Anthropic. */
export interface Provider {
  complete(request: {
    readonly model: string;
    readonly prompt: string;
    readonly params: Readonly<Record<string, unknown>>;
  }): Promise<ProviderResponse>;
}

export interface ProviderResponse {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Exactly what came back, unedited. Stored as `runs.payload`. */
  readonly raw: unknown;
}

/**
 * Why a run did not happen.
 *
 * Typed rather than a message, for the same reason EPIC-030's `NotGradedReason` is: EPIC-032 has to
 * say *which* of these it was, and three of the four are things a person can act on.
 *
 * `provider_not_configured` and `queue_unavailable` are EPIC-032's additions, and they are the two
 * that are nobody's mistake but ours: with no key there is no honest run, and with no queue behind
 * the row there is no run at all. A crash is not an answer to either — it reaches the person as a
 * page that never finishes rather than as a sentence they can act on.
 *
 * **They are two reasons rather than one because they send a person to different places.** The
 * first is a key that is not set; the second is a queue that did not accept the job, with the key
 * quite possibly set all along. Collapsing them would tell somebody to go and configure a provider
 * they had already configured, which is a wrong answer delivered confidently — the exact failure
 * this type exists to prevent.
 */
export type RefusalReason =
  | "budget_exhausted"
  | "model_not_priced"
  | "provider_not_configured"
  | "queue_unavailable";

export type RunOutcome =
  | { readonly status: "ran"; readonly runId: string; readonly text: string; readonly costCents: number }
  | { readonly status: "cached"; readonly runId: string; readonly text: string; readonly costCents: 0 }
  | { readonly status: "refused"; readonly reason: RefusalReason };

export interface RunRequest {
  readonly owner: string;
  readonly promptId: string;
  /**
   * The compiled prompt — **what the model actually receives, and all of it**.
   *
   * With EPIC-032 the input row is *substituted into* this string before the request is built, so
   * this is the whole message. See `input` for what happened to the other half.
   */
  readonly compiled: string;
  /**
   * The canonical serialisation of the input row, **hashed and never appended**.
   *
   * It is what `inputHash` records and what makes two different rows two different cache entries.
   * It used to be concatenated onto `compiled` as well, which — once the row is bound into the
   * prompt — sends every value a second time (EPIC-032 note 1). A test names that exact assembly.
   */
  readonly input: string;
  readonly model: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * `sha(compiled + input + model + params)`, the roadmap's key.
 *
 * ## Why the fields are serialised rather than concatenated
 *
 * Concatenating with a separator is only safe if the separator cannot appear in a field, and these
 * fields are a person's prompt and a person's input — there is no character they cannot contain. A
 * space separator would make `compiled: "a b", input: "c"` and `compiled: "a", input: "b c"` hash
 * identically, which is a cache that returns one request's answer for another's.
 *
 * `JSON.stringify` of an array is injective: the escaping makes every distinct tuple a distinct
 * string, whatever the fields contain. That is the property this needs, and it needs it rather than
 * merely benefiting from it — a cache collision here serves somebody the wrong model output.
 *
 * The first version of this used a raw NUL as the separator, which is a defensible choice and was
 * also an accident: three NUL bytes ended up in the source, and `pnpm binary-files` failed the build
 * because a file git treats as binary shows no diff and cannot be reviewed. Both problems go away
 * here.
 *
 * Parameter keys are sorted so two identical parameter sets written in different orders are one
 * cache entry rather than two, and a re-run does not miss the cache because somebody reordered a
 * literal.
 */
export function cacheKeyFor(request: RunRequest): string {
  const params = Object.fromEntries(
    Object.entries(request.params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );
  return createHash("sha256")
    .update(JSON.stringify([request.compiled, request.input, request.model, params]))
    .digest("hex");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Rough token count for the reservation.
 *
 * **Deliberately crude and deliberately generous.** It is used only to size a reservation that is
 * released afterwards, so being wrong costs a user some headroom for the length of one call. Four
 * characters per token is the widely used approximation; the `+ 1` stops an empty prompt reserving
 * nothing, which would let a zero-token call slip past a cap that is already full.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 1;
}

/**
 * Run one input, or explain why not.
 *
 * Order matters and each step is ahead of the next for a reason: the price is checked before the
 * budget because an unpriced model cannot be reserved for; the cache is checked before the
 * reservation because a hit spends nothing and reserving for it would consume budget for a call that
 * never happens.
 */
export async function executeRun(
  db: Db,
  provider: Provider,
  request: RunRequest,
  now: () => Date = () => new Date()
): Promise<RunOutcome> {
  const price = priceFor(request.model);
  if (price === undefined) {
    // Decision 4. Not a crash, and emphatically not a run at an assumed zero.
    return { status: "refused", reason: "model_not_priced" };
  }

  const cacheKey = cacheKeyFor(request);

  // The cache answers first, and a hit spends nothing (decision 5). EPIC-032 owes the user a
  // sentence about that, because it means a re-run is free and the number they see changes.
  const [hit] = await db
    .select({ id: runs.id, payload: runs.payload })
    .from(runs)
    .where(and(eq(runs.owner, request.owner), eq(runs.cacheKey, cacheKey)))
    .limit(1);
  if (hit) {
    const payload = hit.payload as { text?: string };
    return { status: "cached", runId: hit.id, text: payload.text ?? "", costCents: 0 };
  }

  const reservationCents = reservationCentsFor(price, estimateTokens(request.compiled) + estimateTokens(request.input));

  const outcome = await withReservation(db, request.owner, reservationCents, async () => {
    const startedAt = Date.now();
    const response = await provider.complete({
      model: request.model,
      // The compiled prompt, exactly. The row is already in it (EPIC-032 note 1).
      prompt: request.compiled,
      params: request.params
    });
    const latencyMs = Date.now() - startedAt;
    const actualCents = costCentsFor(price, response.inputTokens, response.outputTokens);

    const [row] = await db
      .insert(runs)
      .values({
        owner: request.owner,
        prompt: request.promptId,
        // Rule 6: the raw provider payload, unedited. `text` is kept alongside it so a cache hit can
        // answer without knowing any provider's response shape.
        payload: { text: response.text, raw: response.raw },
        promptHash: hash(request.compiled),
        inputHash: hash(request.input),
        model: request.model,
        params: request.params,
        latencyMs,
        costCents: actualCents,
        // Decision 1: stamped here, at insert, from the constant the privacy page imports.
        purgeAfter: purgeAfterFor(now()),
        cacheKey
      })
      .returning({ id: runs.id });

    return { actualCents, value: { runId: row!.id, text: response.text } };
  });

  if (!outcome.allowed) {
    // Decision 2: refuse. A queue that never drains is an outage that looks like patience.
    return { status: "refused", reason: "budget_exhausted" };
  }

  return {
    status: "ran",
    runId: outcome.value!.runId,
    text: outcome.value!.text,
    costCents: outcome.actualCents!
  };
}

/**
 * Run a whole input set, stopping at the cap and **keeping what already ran**.
 *
 * Decision 6. Hitting the cap at input 50 of 200 stops the run and keeps the 50: EPIC-030's
 * `RunSummary` already says "50 of 200 ran" without ambiguity, so throwing away paid-for work buys a
 * cleaner story at the user's expense.
 *
 * Sequential on purpose for now — per-owner concurrency is a limit, and one is the safest limit until
 * there is a reason for more. Parallel calls would also make the reservation race itself: two calls
 * could each reserve against the same headroom.
 */
export async function executeRunSet(
  db: Db,
  provider: Provider,
  requests: readonly RunRequest[],
  now: () => Date = () => new Date()
): Promise<{ readonly outcomes: readonly RunOutcome[]; readonly stoppedEarly: boolean }> {
  const outcomes: RunOutcome[] = [];

  for (const request of requests) {
    const outcome = await executeRun(db, provider, request, now);
    outcomes.push(outcome);
    if (outcome.status === "refused" && outcome.reason === "budget_exhausted") {
      return { outcomes, stoppedEarly: true };
    }
  }

  return { outcomes, stoppedEarly: false };
}
