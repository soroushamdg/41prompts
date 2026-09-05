import type { CSSProperties } from "react";
import { cx } from "../cx";

export interface MeterProps {
  /** 0-100. */
  value: number;
  description: string;
  status?: "pass" | "fail" | "drift";
  className?: string;
}

const FILL_CLASS: Record<NonNullable<MeterProps["status"]>, string> = {
  pass: "cell-pass",
  fail: "cell-fail",
  drift: "cell-drift",
};

/** A read-only progress bar. `role="meter"` needs both an accessible name (`aria-label`) and
 * `aria-valuetext` — the name says what is being measured, valuetext carries the number. Colour
 * is never the only signal: the sibling numeric table cells already carry it in text. */
export function Meter({ value, description, status, className }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx("meter-track", className)}
      role="meter"
      aria-label={description}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={description}
    >
      <span
        className={cx("meter-fill", status && FILL_CLASS[status])}
        style={{ "--meter-value": `${clamped}%` } as CSSProperties}
      />
    </div>
  );
}
