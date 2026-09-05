// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

export interface RunBudgetState {
  capCents: number;
  spentCents: number;
}

export interface RunBudgetIncrementResult {
  allowed: boolean;
  spentCents: number;
}

// Pure decision function behind the `run_budgets` hard cap (EPIC-004 decision 6): given the
// current state and an amount to add, decide whether the increment is allowed and what the
// resulting spend is. No IO — the atomic, concurrency-safe version of this same rule lives in
// `apps/worker` as a single conditional SQL UPDATE that encodes exactly this condition
// (`spentCents + amountCents <= capCents`), so this function is also the spec that update has to
// match, not just a unit under test in isolation.
export function applyBudgetIncrement(state: RunBudgetState, amountCents: number): RunBudgetIncrementResult {
  if (amountCents < 0) {
    throw new Error("amountCents must not be negative");
  }

  const nextSpentCents = state.spentCents + amountCents;
  if (nextSpentCents > state.capCents) {
    return { allowed: false, spentCents: state.spentCents };
  }

  return { allowed: true, spentCents: nextSpentCents };
}
