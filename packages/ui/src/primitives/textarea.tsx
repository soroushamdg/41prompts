import type { TextareaHTMLAttributes } from "react";
import { cx } from "../cx";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Monospace, matching the mockup's compiled-prompt / constraint-editor text areas. Unlabelled by
 * design — pair with a real `<label htmlFor>` at the call site. */
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cx("field-textarea", className)}
      // See input.tsx's identical comment — Chromium's screenshot capture, not a real mismatch.
      suppressHydrationWarning
      {...rest}
    />
  );
}
