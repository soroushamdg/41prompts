"use client";
import { useEffect, useRef } from "react";
import { attachLogoMorph, LOGO_REST } from "@/lib/logo";

type Props = { href: string; label: string; size?: number; className?: string };

/** The live logo. Markup matches the mockup; the morph is src/lib/logo.ts. */
export function Logo({ href, label, size, className }: Props) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => (ref.current ? attachLogoMorph(ref.current) : undefined), []);
  return (
    <a
      ref={ref}
      className={className ? `logo ${className}` : "logo"}
      data-logo=""
      href={href}
      aria-label={label}
      style={size ? ({ "--logo-size": `${size}px` } as React.CSSProperties) : undefined}
    >
      <svg className="logo-glyphs" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect className="logo-plate" x="2.5" y="2.5" width="59" height="59" rx="5" />
        <path className="logo-glyph" data-logo-left="" d={LOGO_REST.left} fillRule="evenodd" />
        <path className="logo-glyph" data-logo-right="" d={LOGO_REST.right} fillRule="evenodd" />
      </svg>
      <span className="logo-word">prompts</span>
    </a>
  );
}
