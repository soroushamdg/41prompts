import type { ReactNode } from "react";
import { cx } from "../cx";

export interface PillProps {
  children: ReactNode;
  /** CSS colour for the leading dot — pass a `var(--color-*)` token, never a literal hex. */
  dotColor?: string;
  className?: string;
}

export function Pill({ children, dotColor, className }: PillProps) {
  return (
    <span className={cx("pill", className)}>
      {dotColor && <i className="pill-dot" style={{ background: dotColor }} aria-hidden="true" />}
      {children}
    </span>
  );
}
