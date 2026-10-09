"use client";
import { useEffect, useRef } from "react";
import { LOGO_REST, logoEase, logoPaths, logoShapes } from "@/lib/logo";
import s from "./sign-in.module.css";

/* Sheet 00: the logo's construction drawing, ported from
   docs/assets/js/pages/sign-in.js. The grid draws, then the plate, the
   dimensions and the glyph outlines; vertex markers land with live
   coordinates, the plate fills, and then 41 ↔ AI morphs every 3.2 s. */

const SETS: Array<[from: "four" | "one", to: "A" | "I", part: "outer" | "inner"]> = [["four", "A", "outer"], ["four", "A", "inner"], ["one", "I", "outer"]];
const LABELLED = new Set(["four-outer-0", "four-outer-2", "four-outer-8", "one-outer-2"]);

type Mark = { from: [number, number]; to: [number, number]; key: string; labelled: boolean; order: number };
const MARKS: Mark[] = [];
for (const [from, to, part] of SETS) {
  logoShapes[from][part]!.forEach((pt, i) => {
    const key = `${from}-${part}-${i}`;
    MARKS.push({ from: pt, to: logoShapes[to][part]![i]!, key, labelled: LABELLED.has(key), order: MARKS.length });
  });
}

let minor = "", major = "";
for (let u = 0; u <= 64; u += 4) {
  const line = `M${u} 0V64M0 ${u}H64`;
  if (u % 16 === 0) major += line;
  else minor += line;
}

const fmt = (n: number) => n.toFixed(1).replace(".0", "");

export function MarkSheet() {
  const svg = useRef<SVGSVGElement>(null);
  const left = useRef<SVGPathElement>(null);
  const right = useRef<SVGPathElement>(null);
  const state = useRef<HTMLSpanElement>(null);
  const circles = useRef<Array<SVGCircleElement | null>>([]);
  const labels = useRef<Array<SVGTextElement | null>>([]);

  useEffect(() => {
    const el = svg.current;
    if (!el || el.getBoundingClientRect().width === 0) return;
    function draw(v: number) {
      const paths = logoPaths(v), e = logoEase(v);
      left.current?.setAttribute("d", paths.left);
      right.current?.setAttribute("d", paths.right);
      MARKS.forEach((m, i) => {
        const x = m.from[0] + (m.to[0] - m.from[0]) * e, y = m.from[1] + (m.to[1] - m.from[1]) * e;
        const c = circles.current[i];
        c?.setAttribute("cx", x.toFixed(2));
        c?.setAttribute("cy", y.toFixed(2));
        const t = labels.current[i];
        if (t) {
          t.setAttribute("x", (x + 1.4).toFixed(2));
          t.setAttribute("y", (y - 1.2).toFixed(2));
          t.textContent = `${fmt(x)},${fmt(y)}`;
        }
      });
    }
    draw(0);
    if (document.documentElement.classList.contains("reduce")) {
      for (const k of ["drawn", "dims", "vx", "solid"]) el.setAttribute(`data-${k}`, "");
      return;
    }
    let v = 0, target = 0, raf = 0, last = 0;
    const DUR = 900;
    function step(now: number) {
      if (!last) last = now;
      const dt = Math.min(64, now - last); last = now;
      const dir = target > v ? 1 : -1;
      v += (dir * dt) / DUR;
      if ((dir > 0 && v >= target) || (dir < 0 && v <= target)) {
        v = target; raf = 0; last = 0; draw(v);
        if (state.current) state.current.textContent = `${v ? "AI" : "41"} · rest`;
        return;
      }
      draw(v);
      if (state.current) state.current.textContent = `Morph · ${Math.round(logoEase(v) * 100)}%`;
      raf = requestAnimationFrame(step);
    }
    const go = (t: number) => { target = t; if (!raf) raf = requestAnimationFrame(step); };
    const timers: number[] = [];
    const first = requestAnimationFrame(() => { el.getBoundingClientRect(); el.setAttribute("data-drawn", ""); });
    timers.push(window.setTimeout(() => el.setAttribute("data-dims", ""), 1500));
    timers.push(window.setTimeout(() => el.setAttribute("data-vx", ""), 2600));
    timers.push(window.setTimeout(() => el.setAttribute("data-solid", ""), 3900));
    let cycle = 0;
    const loop = () => { if (!document.hidden) go(target ? 0 : 1); cycle = window.setTimeout(loop, 3200); };
    timers.push(window.setTimeout(loop, 5200));
    return () => { cancelAnimationFrame(first); if (raf) cancelAnimationFrame(raf); timers.forEach(clearTimeout); clearTimeout(cycle); };
  }, []);

  return (
    <section className={`${s.art} app-bg`} aria-hidden="true">
      <div className={s.markSheet}>
        <svg ref={svg} className={s.ms} viewBox="-22 -20 108 104">
          <g className="ms-grid">
            <path d={minor} pathLength={1} data-draw-me="" style={{ "--ms": "1600ms", "--dl": "0ms" } as React.CSSProperties} />
            <path d={major} className="maj" pathLength={1} data-draw-me="" style={{ "--ms": "1600ms", "--dl": "200ms" } as React.CSSProperties} />
          </g>
          <g className="ms-dim">
            <path data-draw-me="" pathLength={1} style={{ "--dl": "900ms", "--ms": "900ms" } as React.CSSProperties} d="M0 -12V-2M64 -12V-2M0 -9H64M-1 -8L1 -10M63 -8L65 -10" />
            <path data-draw-me="" pathLength={1} style={{ "--dl": "1050ms", "--ms": "900ms" } as React.CSSProperties} d="M-12 0H-2M-12 64H-2M-9 0V64M-10 -1L-8 1M-10 63L-8 65" />
            <path data-draw-me="" pathLength={1} style={{ "--dl": "1200ms", "--ms": "900ms" } as React.CSSProperties} d="M50 14H74M50 50H74M72 14V50M71 13L73 15M71 49L73 51" />
            <path data-draw-me="" pathLength={1} style={{ "--dl": "1350ms", "--ms": "700ms" } as React.CSSProperties} d="M60.04 3.96L69 -5H77" />
            <text x="32" y="-11" textAnchor="middle">64</text>
            <text x="-11" y="32" textAnchor="middle" transform="rotate(-90 -11 32)">64</text>
            <text x="73.6" y="33">36</text>
            <text x="77.6" y="-4.4">R5</text>
          </g>
          <rect className="ms-plate" data-draw-me="" pathLength={1} style={{ "--dl": "500ms", "--ms": "1300ms" } as React.CSSProperties} x="2.5" y="2.5" width="59" height="59" rx="5" />
          <path ref={left} className="ms-glyph" data-draw-me="" pathLength={1} style={{ "--dl": "1500ms", "--ms": "1300ms" } as React.CSSProperties} fillRule="evenodd" d={LOGO_REST.left} />
          <path ref={right} className="ms-glyph" data-draw-me="" pathLength={1} style={{ "--dl": "1700ms", "--ms": "1100ms" } as React.CSSProperties} fillRule="evenodd" d={LOGO_REST.right} />
          <g className="ms-vx">
            {MARKS.map((m, i) => (
              <g key={m.key}>
                <circle ref={(c) => { circles.current[i] = c; }} r=".85" cx={m.from[0]} cy={m.from[1]} style={{ transitionDelay: `${m.order * 45}ms` }} />
                {m.labelled && <text ref={(t) => { labels.current[i] = t; }} style={{ transitionDelay: `${m.order * 45 + 200}ms` }} />}
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className={s.cap}>
        <span className="titleblock"><span>41prompts</span><span>Sheet 00</span><span>Mark construction</span><span>Units 64</span></span>
        <span className="label" ref={state}>41 · rest</span>
      </div>
    </section>
  );
}
