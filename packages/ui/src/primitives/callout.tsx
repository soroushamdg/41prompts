import type { ReactNode } from "react";
import { cx } from "../cx";
import { StatusIcon, type Status } from "./status-icon";

export interface CalloutProps {
  status: Status | "info";
  title: string;
  children: ReactNode;
  className?: string;
}

const GLYPH_FOR: Record<CalloutProps["status"], Status | null> = {
  pass: "pass",
  fail: "fail",
  drift: "drift",
  info: null,
};

export function Callout({ status, title, children, className }: CalloutProps) {
  const glyphStatus = GLYPH_FOR[status];
  return (
    <div
      className={cx("callout", status === "fail" && "callout-fail", status === "drift" && "callout-warn", status === "info" && "callout-info", className)}
      role={status === "fail" ? "alert" : undefined}
    >
      <span className="callout-icon" aria-hidden="true">
        {glyphStatus ? <StatusIcon status={glyphStatus} /> : "i"}
      </span>
      <div>
        <b className="callout-title">{title}</b>
        <p className="callout-body">{children}</p>
      </div>
    </div>
  );
}
