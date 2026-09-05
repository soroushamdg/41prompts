import { cx } from "../cx";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  "aria-label": string;
  className?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, className, disabled, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={cx("switch", className)}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}
