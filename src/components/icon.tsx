import { cx } from "@/lib/cx";
import { ICONS, type IconName } from "./icons";

/** Inline SVG sprite, rendered once per root layout. */
export function IconSprite() {
  const symbols = Object.entries(ICONS)
    .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`)
    .join("");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: symbols }}
    />
  );
}

export function Icon({ name, size, className }: { name: IconName; size?: "sm" | "lg"; className?: string }) {
  return (
    <svg className={cx("i", size && `i--${size}`, className)} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}
