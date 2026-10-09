"use client";
import { useRef } from "react";
import { useCrosshair } from "../_motion/use-crosshair";

/* The CAD crosshair over the hero: dashed guides and an X/Y readout follow
   the mouse. It dims over links, buttons and the Sheet 01 drawing. */
export function HeroCrosshair() {
  const ref = useRef<HTMLDivElement>(null);
  useCrosshair(ref, "a, button, input, textarea, [data-xhair-dim]");
  return (
    <div className="xhair" aria-hidden="true" ref={ref}>
      <span className="xhair__h" />
      <span className="xhair__v" />
      <span className="xhair__read" />
    </div>
  );
}
