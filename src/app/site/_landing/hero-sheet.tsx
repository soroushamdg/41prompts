"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cx } from "@/lib/cx";
import { drawPath, showPath } from "../_motion/draw-path";
import { usePrefersReducedMotion } from "../_motion/reduced-motion";
import { routeLeader } from "../_motion/route-leader";
import { useLoop, type LoopStep } from "../_motion/use-loop";
import s from "../landing.module.css";

/* Sheet 01 (DESIGN.md §8): paste → scan → split → run → trace, on an 11.8 s
   loop. 0.7 s scan line; 2.0 s the paragraph splits into four typed bloks with
   conflict warnings; 3.9 s runs appear; 4.3 / 4.65 / 5.0 s GPT, Claude and
   Gemini complete; 6.0 s the leader line routes from the Gemini failure to B3,
   B3 turns red and the "Likely cause" callout appears. Reduced motion shows
   the end state and never loops. Ported from docs/assets/js/landing.js. */

type Sheet = { scan: boolean; split: boolean; run: boolean; trace: boolean; done: number; status: string; bad: boolean };

const START: Sheet = { scan: false, split: false, run: false, trace: false, done: 0, status: "Pasted · 4 sentences", bad: false };
const END: Sheet = { scan: false, split: true, run: true, trace: true, done: 3, status: "Failure traced to B3", bad: true };
const PERIOD = 11_800;

const RUNS = [
  { model: "GPT", result: "40/40", bad: false },
  { model: "Claude", result: "40/40", bad: false },
  { model: "Gemini", result: "31/40", bad: true },
] as const;

export function HeroSheet() {
  const reduce = usePrefersReducedMotion();
  const [sheet, setSheet] = useState<Sheet>(START);
  const view = reduce ? END : sheet;

  const hdRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const causeRef = useRef<HTMLDivElement>(null);
  const failRef = useRef<HTMLDivElement>(null);
  const failResRef = useRef<HTMLSpanElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const traced = useRef(false);

  /** Routes the leader line from the Gemini result to B3 and parks the callout between them. */
  const trace = useCallback((instant: boolean) => {
    const svg = wireRef.current;
    const path = pathRef.current;
    const dot = dotRef.current;
    const cause = causeRef.current;
    const fail = failRef.current;
    const res = failResRef.current;
    const callout = calloutRef.current;
    if (!svg || !path || !dot || !cause || !fail || !res || !callout) return;
    const end = routeLeader(svg, path, res, cause, { side: "right", gutter: 22 });
    dot.setAttribute("cx", String(end.x));
    dot.setAttribute("cy", String(end.y));
    const host = (svg.parentElement ?? svg).getBoundingClientRect();
    const c = cause.getBoundingClientRect();
    const f = fail.getBoundingClientRect();
    callout.style.top = `${(c.bottom + f.top) / 2 - host.top - 11}px`;
    if (instant) showPath(path);
    else drawPath(path, 1000);
  }, []);

  const steps = useMemo<LoopStep[]>(
    () => [
      [
        0,
        () => {
          traced.current = false;
          const path = pathRef.current;
          if (path) {
            path.style.transition = "none";
            path.style.strokeDasharray = "2000";
            path.style.strokeDashoffset = "2000";
          }
          setSheet(START);
        },
      ],
      [700, () => setSheet((v) => ({ ...v, scan: true, status: "Reading · decompiling", bad: false }))],
      [2000, () => setSheet((v) => ({ ...v, scan: false, split: true, status: "4 bloks · 1 conflict", bad: true }))],
      [3900, () => setSheet((v) => ({ ...v, run: true, status: "Running on 3 models", bad: false }))],
      [4300, () => setSheet((v) => ({ ...v, done: 1 }))],
      [4650, () => setSheet((v) => ({ ...v, done: 2 }))],
      [5000, () => setSheet((v) => ({ ...v, done: 3 }))],
      [
        6000,
        () => {
          traced.current = true;
          trace(false);
          setSheet((v) => ({ ...v, trace: true, status: "Failure traced to B3", bad: true }));
        },
      ],
    ],
    [trace],
  );

  const replay = useLoop(hdRef, steps, PERIOD, !reduce);

  // Reduced motion: the end state, with the line drawn once layout has settled.
  useEffect(() => {
    if (!reduce) return;
    traced.current = true;
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => trace(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [reduce, trace]);

  // Keep the leader line attached when the drawing resizes (viewport, fonts).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (traced.current) trace(true);
      }, 120);
    });
    ro.observe(stage);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [trace]);

  return (
    <figure
      ref={hdRef}
      className={cx(s.hd, "frame frame--chalk", view.scan && s.isScan, view.split && s.isSplit, view.run && s.isRun, view.trace && s.isTrace)}
      aria-label="Animated drawing: a pasted prompt splits into four bloks, runs on three models, and the failure is traced back to the example blok."
      data-xhair-dim=""
    >
      <div className={s.hdBar}>
        <span className="label">Sheet 01 · Decompile</span>
        <span className={cx(s.hdFile, "mono")}>support-reply.prompt</span>
        <span className={cx(s.hdStatus, "mono", view.bad && s.isBad)} aria-live="off">
          {view.status}
        </span>
      </div>
      <div className={s.hdStage} ref={stageRef}>
        <div className={s.hdBloks}>
          <div className={s.hdSeg} data-type="context">
            <em className={s.hdLbl}>
              <span>Context</span>
              <span className={s.hdId}>B1</span>
            </em>
            <span>You are a support agent for Northwind Outfitters.</span>
          </div>
          <div className={s.hdSeg} data-type="constraint">
            <em className={s.hdLbl}>
              <span>Constraint</span>
              <span className={s.hdId}>B2</span>
            </em>
            <span>
              Reply in under 80 words. Greet the customer as <span className="var">{"{{name}}"}</span>.
            </span>
          </div>
          <div className={cx(s.hdSeg, s.hdCause)} data-type="example" ref={causeRef}>
            <em className={s.hdLbl}>
              <span>Example</span>
              <span className={s.hdWarn}>Conflicts with B4</span>
            </em>
            <span>“I’ve issued a full refund, sorry for the trouble.”</span>
          </div>
          <div className={s.hdSeg} data-type="expects">
            <em className={s.hdLbl}>
              <span>Expects</span>
              <span className={s.hdWarn}>Conflicts with B3</span>
            </em>
            <span>Never promises a refund.</span>
          </div>
        </div>
        <div className={s.hdRuns} aria-hidden="true">
          {RUNS.map((r, i) => (
            <div key={r.model} className={cx(s.hdRun, r.bad && s.isBad, view.done > i && s.isDone)} ref={r.bad ? failRef : undefined}>
              <span className={s.hdSt}>
                <Icon name={r.bad ? "x" : "check"} size="sm" />
              </span>
              <span>{r.model}</span>
              <span className={s.hdMeter}>
                <i />
              </span>
              <span className={s.hdRes} ref={r.bad ? failResRef : undefined}>
                {r.result}
              </span>
            </div>
          ))}
        </div>
        <svg className={s.hdWire} aria-hidden="true" ref={wireRef}>
          <path ref={pathRef} d="M0 0" style={{ strokeDasharray: 2000, strokeDashoffset: 2000 }} />
          <circle ref={dotRef} r="3.5" cx="0" cy="0" />
        </svg>
        <div className={cx(s.hdCallout, "mono")} aria-hidden="true" ref={calloutRef}>
          Likely cause · B3 · 82%
        </div>
        <span className={s.hdScan} aria-hidden="true" />
      </div>
      <figcaption className={s.hdFoot}>
        <span className="titleblock">
          <span>41prompts</span>
          <span>Sheet 01</span>
          <span>Scale 1:1</span>
          <span>Rev 7</span>
        </span>
        <button className="btn btn--sm btn--bare" type="button" onClick={replay}>
          <Icon name="history" size="sm" />
          Replay
        </button>
      </figcaption>
    </figure>
  );
}
