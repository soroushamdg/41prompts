import type { InputHTMLAttributes } from "react";
import { cx } from "../cx";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

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
