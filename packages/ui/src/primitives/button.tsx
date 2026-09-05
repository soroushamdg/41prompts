import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";

export type ButtonVariant = "default" | "primary" | "ghost";
export type ButtonSize = "default" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "default", size = "default", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx("btn", variant === "primary" && "btn-pri", variant === "ghost" && "btn-ghost", size === "sm" && "btn-sm", className)}
      {...rest}
    />
  );
}
