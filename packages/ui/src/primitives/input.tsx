import type { InputHTMLAttributes, Ref } from "react";
import { cx } from "../cx";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * React 19 passes `ref` to a function component as an ordinary prop, so this needs no
   * `forwardRef` — only a type saying it is accepted. Declared because a caller has a real use for
   * it: the share panel selects the link field when the clipboard API is unavailable, which is the
   * fallback that keeps the Copy button from silently doing nothing outside a secure context.
   */
  ref?: Ref<HTMLInputElement>;
}

/** Unlabelled by design — pair with a real `<label htmlFor>` at the call site. */
export function Input({ className, ...rest }: InputProps) {
  return (
    <input
      className={cx("field-input", className)}
      // Chromium's own screenshot capture defensively sets caret-color:transparent on text
      // inputs, which shows up as a client-only style attribute React never rendered
      // server-side — a testing-tool artifact, not a real markup mismatch.
      suppressHydrationWarning
      {...rest}
    />
  );
}
