import type { ReactNode } from "react";
import { cx } from "../cx";

export interface TagProps {
  children: ReactNode;
  className?: string;
}

/** Blok-kind label. Ink-only by design — see plan-EPIC-003.md's blok-category-colour deviation. */
export function Tag({ children, className }: TagProps) {
  return <span className={cx("tag", className)}>{children}</span>;
}
