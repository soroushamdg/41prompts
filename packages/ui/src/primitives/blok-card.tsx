import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export interface BlokCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kindTag: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
}

/** A real `<button>` — every blok in the canvas is keyboard-reachable and -activatable, not a
 * `div` with an onClick. */
export function BlokCard({ kindTag, children, meta, selected, className, type = "button", ...rest }: BlokCardProps) {
  return (
    <button type={type} className={cx("blok-card", className)} data-selected={selected ? "true" : undefined} {...rest}>
      <div className="blok-card-top">{kindTag}</div>
      <div className="blok-card-body">{children}</div>
      {meta && <div className="blok-card-meta">{meta}</div>}
    </button>
  );
}
