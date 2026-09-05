import type { ReactNode } from "react";
import { cx } from "../cx";
import { StatusIcon, type Status } from "./status-icon";

export interface BadgeProps {
  status: Status | "neutral";
  children: ReactNode;
  className?: string;
}

/** Pass/fail/drift, always icon + text (decision 3 / CLAUDE.md rule 10 — never colour alone). */
export function Badge({ status, children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        "badge",
        status === "pass" && "badge-pass",
        status === "fail" && "badge-fail",
        status === "drift" && "badge-drift",
        status === "neutral" && "badge-neutral",
        className,
      )}
    >
      {status !== "neutral" && <StatusIcon status={status} />}
      {children}
    </span>
  );
}
