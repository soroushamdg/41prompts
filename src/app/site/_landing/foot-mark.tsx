"use client";
import { useEffect, useRef } from "react";
import { EASE_DRAW } from "../_motion/draw-path";
import { prefersReducedMotion } from "../_motion/reduced-motion";
import { useReveal } from "../_motion/use-reveal";
import s from "../landing.module.css";

/* The footer wordmark draws its own outline when it scrolls into view (3.4 s).
   Reduced motion shows it drawn. */
export function FootMark() {
  const textRef = useRef<SVGTextElement>(null);
  const { ref } = useReveal<SVGSVGElement>({
    onReveal: () => {
      const t = textRef.current;
      if (!t || prefersReducedMotion()) return;
      t.getBoundingClientRect();
      t.style.transition = `stroke-dashoffset 3400ms ${EASE_DRAW}, fill 800ms, stroke 400ms`;
      t.style.strokeDashoffset = "0";
    },
  });

  useEffect(() => {
    const t = textRef.current;
    if (!t || prefersReducedMotion()) return;
    t.style.strokeDasharray = "2400 2400";
    t.style.strokeDashoffset = "2400";
  }, []);

  return (
    <svg ref={ref} className={s.siteFootMark} viewBox="0 0 1200 300" aria-hidden="true">
      <text ref={textRef} x="2" y="226" textLength="1194" lengthAdjust="spacing">
        41prompts
      </text>
    </svg>
  );
}
