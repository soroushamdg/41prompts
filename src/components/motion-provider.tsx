"use client";
import { MotionConfig } from "motion/react";

/** Motion is used only for layout (FLIP) animations; it honours reduced motion. */
export const EASE_BRAND = [0.32, 0.72, 0, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ layout: { duration: 0.42, ease: EASE_BRAND } }}>
      {children}
    </MotionConfig>
  );
}
