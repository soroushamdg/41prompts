/* Product Hunt review badge (embed from producthunt.com). */
export const PH_REVIEW_URL = "https://www.producthunt.com/products/41prompts/reviews/new?utm_source=badge-product_review&utm_medium=badge&utm_source=badge-41prompts";
export const PH_BADGE_SRC = "https://api.producthunt.com/widgets/embed-image/v1/product_review.svg?product_id=1114733&theme=neutral";
export const PH_BADGE_ALT = "41Prompts - Stop guessing which prompt works | Product Hunt";

/* When the app asks for a review. Each stage is a moment someone has just
   got value out of the product; the dialog shows at most once per visit,
   at most three times ever, never twice within three days, and never again
   after "Never ask me again" or a click through to the review. */
export type ReviewStage = "run_completed" | "tenth_version" | "fifth_copy" | "returning";

export const REVIEW_RULES = {
  maxAsks: 3,
  minDaysBetweenAsks: 3,
  snoozeDays: 14,
  minAccountMinutes: 30,
  returningAfterDays: 7,
} as const;

export type ReviewState = {
  status: "open" | "snoozed" | "never" | "reviewed";
  snoozedUntil: string | null;
  askCount: number;
  lastAskedAt: string | null;
  accountCreatedAt: string;
};

/** Whether the review dialog may show now. Pure, so the client and tests agree. */
export function mayAskForReview(s: ReviewState, now: Date = new Date()): boolean {
  if (s.status === "never" || s.status === "reviewed") return false;
  if (s.askCount >= REVIEW_RULES.maxAsks) return false;
  if (s.snoozedUntil && new Date(s.snoozedUntil) > now) return false;
  if (s.lastAskedAt && now.getTime() - new Date(s.lastAskedAt).getTime() < REVIEW_RULES.minDaysBetweenAsks * 86_400_000) return false;
  if (now.getTime() - new Date(s.accountCreatedAt).getTime() < REVIEW_RULES.minAccountMinutes * 60_000) return false;
  return true;
}
