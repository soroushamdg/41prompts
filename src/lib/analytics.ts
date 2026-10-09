/* One door for product analytics. PostHog is wired in later; until then, and
   whenever no key is configured, track() does nothing. Never pass prompt
   text, key material or email addresses as properties. */

export type AnalyticsEvent =
  | "signed_up"
  | "signed_in"
  | "prompt_created"
  | "prompt_copied"
  | "run_completed"
  | "key_saved"
  | "export_completed"
  | "account_deleted"
  | "performance_control_clicked"
  | "performance_interest";

type Props = Record<string, string | number | boolean | null | undefined>;
type Sink = (event: AnalyticsEvent, props?: Props) => void;

let sink: Sink | null = null;

export function setAnalyticsSink(next: Sink | null) {
  sink = next;
}

export function track(event: AnalyticsEvent, props?: Props) {
  try {
    sink?.(event, props);
  } catch {
    /* analytics must never break the product */
  }
}
