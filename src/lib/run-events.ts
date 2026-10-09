/** What a run streams back, from /api/run or from the browser (M06). Tokens
    and cost are null when the provider does not report usage or has no price. */
export type RunEvent =
  | { t: "start"; model: string }
  | { t: "delta"; text: string }
  | { t: "done"; inputTokens: number | null; outputTokens: number | null; ms: number; cost: number | null }
  | { t: "error"; message: string };
